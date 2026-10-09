import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectMediaReadinessSignals,
  evaluateMediaReadiness,
  findMediaDecisionTable,
  parseMediaDecisionTableMarkdown,
  type MediaReadinessPurpose,
  type MediaReadinessSignals,
} from "../src/core/media-readiness";
import { pageInventoryEntrySchema, type PageInventoryEntry } from "../src/data/schemas/page-inventory";

// Decision-table unit fixtures belong to this suite, not the adopted game's inventory.
const home = pageInventoryEntrySchema.parse({
  pageId: "home", route: "/", pageType: "home", cluster: "core", module: "core", priority: 100,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  title: "Synthetic Media Readiness Home",
  description: "Synthetic unit-test home for media lifecycle, rights and Human review boundary checks.",
  publishedAt: "2026-09-01", updatedAt: "2026-09-01", primaryKeyword: "synthetic media home",
  tags: ["testing"], relatedPageIds: [], relatedEntityRefs: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-media", sourceType: "editorial", accessedAt: "2026-09-01", evidenceNote: "Synthetic unit-test provenance" }],
});
const pageInventory = [home, pageInventoryEntrySchema.parse({
  ...home, pageId: "guide.getting-started", route: "/guides/getting-started/", pageType: "guide",
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  title: "Synthetic Media Readiness Guide", primaryKeyword: "synthetic media guide",
})];

const validRows = {
  homeResolved:
    "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Media owner | Standard approved integration. |",
  guideResolved:
    "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps but the guide is understandable without it. | inline | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Guide owner | Standard approved integration. |",
  guideNoMedia:
    "| guide.getting-started | guide/article | NO MEDIA NEEDED | This operating guide is useful, comprehensible, and visually complete as text. | none | NOT FOUND | NOT REQUIRED FOR EMBED | APPROVED | NOT INTEGRATED | PASS | original diagram | Guide owner | Approved text-only presentation. |",
};

const canonicalHeaders = [
  "pageId_or_route",
  "page_family",
  "media_need",
  "need_rationale",
  "intended_placement",
  "candidate_state",
  "rights_state",
  "human_decision",
  "integration_state",
  "visual_gate_state",
  "source_or_provenance",
  "owner_or_defer_reason",
  "notes",
] as const;

const unconditionallyRequiredHeaders = canonicalHeaders.filter(
  (header) => header !== "notes",
);

function rowCells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function markdownRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function table(...rows: string[]): string {
  return `
| pageId_or_route | page_family | media_need | need_rationale | intended_placement | candidate_state | rights_state | human_decision | integration_state | visual_gate_state | source_or_provenance | owner_or_defer_reason | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
  `;
}

function signalsFromMarkdown(
  markdown: string,
  inventory: PageInventoryEntry[] = pageInventory,
  purpose: MediaReadinessPurpose = "final",
): MediaReadinessSignals {
  const parsed = parseMediaDecisionTableMarkdown(markdown);
  const signals = collectMediaReadinessSignals({
    inventory,
    decisions: parsed.decisions,
    purpose,
  });

  return {
    errors: [...parsed.errors, ...signals.errors],
    warnings: signals.warnings,
    info: signals.info,
  };
}

describe("media decision table authority path", () => {
  function withTempProject(callback: (projectRoot: string) => void) {
    const projectRoot = mkdtempSync(join(tmpdir(), "starter-media-table-"));
    try {
      callback(projectRoot);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  it("accepts docs/MEDIA_DECISION_TABLE.md as the V2.6.1 project authority", () => {
    withTempProject((projectRoot) => {
      mkdirSync(join(projectRoot, "docs"));
      writeFileSync(join(projectRoot, "docs", "MEDIA_DECISION_TABLE.md"), "");
      expect(findMediaDecisionTable(projectRoot)).toEqual({
        source: "docs",
        path: join(projectRoot, "docs", "MEDIA_DECISION_TABLE.md"),
        errors: [],
      });
    });
  });

  it("resolves docs, root legacy, no-table, and duplicate-authority paths deterministically", () => {
    withTempProject((projectRoot) => {
      expect(findMediaDecisionTable(projectRoot)).toMatchObject({ source: "none", errors: [] });
    });

    withTempProject((projectRoot) => {
      const docsDir = join(projectRoot, "docs");
      writeFileSync(join(projectRoot, "MEDIA_DECISION_TABLE.md"), table(validRows.homeResolved));
      expect(findMediaDecisionTable(projectRoot)).toMatchObject({
        source: "root",
        path: join(projectRoot, "MEDIA_DECISION_TABLE.md"),
        errors: [],
      });

      mkdirSync(docsDir);
      writeFileSync(join(docsDir, "MEDIA_DECISION_TABLE.md"), table(validRows.homeResolved));
      expect(findMediaDecisionTable(projectRoot).errors.join("\n")).toMatch(
        /duplicate media decision table authority|docs\/MEDIA_DECISION_TABLE\.md|root MEDIA_DECISION_TABLE\.md/i,
      );
    });
  });

  it.each(["docs", "root"] as const)("reads a canonical table from the sole %s authority", (source) => {
    withTempProject((projectRoot) => {
      const directory = source === "docs" ? join(projectRoot, "docs") : projectRoot;
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "MEDIA_DECISION_TABLE.md"), table(validRows.guideResolved));

      const location = findMediaDecisionTable(projectRoot);
      expect(location.source).toBe(source);
      expect(location.errors).toEqual([]);
      expect(signalsFromMarkdown(readFileSync(location.path!, "utf8"))).toEqual({
        errors: [], warnings: [], info: [],
      });
    });
  });

  it.each(["docs", "root"] as const)("rejects an existing %s file containing only a noncanonical table", (source) => {
    withTempProject((projectRoot) => {
      const directory = source === "docs" ? join(projectRoot, "docs") : projectRoot;
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "MEDIA_DECISION_TABLE.md"), "| Field | Meaning |\n| --- | --- |\n| notes | Explanation |\n");

      const location = findMediaDecisionTable(projectRoot);
      expect(location.source).toBe(source);
      const parsed = parseMediaDecisionTableMarkdown(readFileSync(location.path!, "utf8"));
      expect(parsed.decisions).toEqual([]);
      expect(parsed.errors.join("\n")).toMatch(/no canonical.*table/i);
    });
  });
});

describe("media readiness V2.6.1 lifecycle projection", () => {
  it("permits integrated structured Human/visual pending blockers only for evidence purpose", () => {
    const pending = parseMediaDecisionTableMarkdown(table(
      "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | SEMANTICALLY VERIFIED | VERIFIED | PENDING | INTEGRATED | PENDING | observed | Media owner | Pending Human review fixture. |",
    ));

    expect(collectMediaReadinessSignals({
      inventory: pageInventory,
      decisions: pending.decisions,
      purpose: "final",
    }).errors).toHaveLength(1);
    expect(collectMediaReadinessSignals({
      inventory: pageInventory,
      decisions: pending.decisions,
      purpose: "evidence",
    }).errors).toEqual([]);
  });

  it.each([
    ["REVISE", "PASS"],
    ["BLOCK", "PASS"],
    ["APPROVED", "REVISE"],
    ["APPROVED", "BLOCK"],
  ] as const)("keeps %s/%s blocking ahead of fallback-only for evidence purpose", (humanDecision, visualGateState) => {
    const cells = rowCells(validRows.homeResolved);
    cells[7] = humanDecision;
    cells[8] = "FALLBACK ONLY";
    cells[9] = visualGateState;
    const parsed = parseMediaDecisionTableMarkdown(table(markdownRow(cells)));

    expect(collectMediaReadinessSignals({
      inventory: pageInventory,
      decisions: parsed.decisions,
      purpose: "evidence",
    }).errors.join("\n")).toMatch(/blocking Human\/visual state/i);
  });

  it("keeps unsupported lifecycle combinations blocking for evidence purpose", () => {
    const parsed = parseMediaDecisionTableMarkdown(table(
      "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | FOUND | VERIFIED | APPROVED | NOT INTEGRATED | PASS | observed | Media owner | Unsupported fixture. |",
    ));

    expect(collectMediaReadinessSignals({
      inventory: pageInventory,
      decisions: parsed.decisions,
      purpose: "evidence",
    }).errors.join("\n")).toMatch(/unsupported media lifecycle combination/i);
  });

  it("preserves structured Human/visual PENDING precedence over fallback-only for evidence purpose", () => {
    const parsed = parseMediaDecisionTableMarkdown(table(
      "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | FOUND | UNRESOLVED | PENDING | FALLBACK ONLY | PENDING | observed | Media owner | Fallback-only pending fixture. |",
    ));
    const final = evaluateMediaReadiness({
      inventory: pageInventory,
      decisions: parsed.decisions,
      purpose: "final",
    });
    const evidence = evaluateMediaReadiness({
      inventory: pageInventory,
      decisions: parsed.decisions,
      purpose: "evidence",
    });

    expect(final.blockingIssues).toEqual([
      expect.objectContaining({ cause: "human-visual-pending" }),
    ]);
    expect(final.signals.errors).toHaveLength(1);
    expect(final.signals.errors.join("\n")).toMatch(/pending/i);
    expect(final.signals.errors.join("\n")).not.toMatch(/fallback-only/i);
    expect(evidence.blockingIssues).toEqual([
      expect.objectContaining({ cause: "human-visual-pending" }),
    ]);
    expect(evidence.permittedEvidenceIssues).toEqual(evidence.blockingIssues);
    expect(evidence.signals.errors).toEqual([]);
  });

  it("keeps approved fallback-only without waiver blocked for final and evidence", () => {
    const parsed = parseMediaDecisionTableMarkdown(table(
      "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | FALLBACK ONLY | PASS | observed | Media owner | Non-waived fallback-only fixture. |",
    ));

    for (const purpose of ["final", "evidence"] as const) {
      const evaluation = evaluateMediaReadiness({
        inventory: pageInventory,
        decisions: parsed.decisions,
        purpose,
      });
      expect(evaluation.blockingIssues).toEqual([
        expect.objectContaining({ cause: "fallback-only" }),
      ]);
      expect(evaluation.permittedEvidenceIssues).toEqual([]);
      expect(evaluation.signals.errors.join("\n")).toMatch(/fallback-only/i);
    }
  });

  it("keeps malformed fallback-only lifecycle data blocked for evidence", () => {
    const malformed = table(
      "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | FOUND | UNRESOLVED | UNKNOWN | FALLBACK ONLY | PENDING | observed | Media owner | Malformed fixture. |",
    );

    expect(signalsFromMarkdown(
      malformed,
      pageInventory,
      "evidence",
    ).errors.join("\n")).toMatch(/human_decision.*UNKNOWN|UNKNOWN.*human_decision/i);
  });

  it("keeps fully resolved integrated state ready for final and evidence", () => {
    for (const purpose of ["final", "evidence"] as const) {
      expect(signalsFromMarkdown(
        table(validRows.homeResolved),
        pageInventory,
        purpose,
      )).toEqual({ errors: [], warnings: [], info: [] });
    }
  });

  it.each([1, 2])("selects the canonical table after %i explanatory tables", (count) => {
    const explanation = "## Reference\n\n| Field | Meaning |\n| --- | --- |\n| notes | Recorded explanation |\n\n";
    const markdown = `# Media planning\n\nReference prose.\n\n${explanation.repeat(count)}## Route Decisions\n${table(validRows.guideResolved)}`;
    const parsed = parseMediaDecisionTableMarkdown(markdown);

    expect(parsed.errors).toEqual([]);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0].pageIdOrRoute).toBe("guide.getting-started");
    expect(parsed.decisions[0].lineNumber).toBe(markdown.split("\n").indexOf(validRows.guideResolved) + 1);
    expect(signalsFromMarkdown(markdown)).toEqual({ errors: [], warnings: [], info: [] });
  });

  it("parses the filled full SOP template including its projection reference tables", () => {
    const markdown = readFileSync(new URL("./fixtures/media/media-decision-table-sop-v2.6.1.md", import.meta.url), "utf8");
    const parsed = parseMediaDecisionTableMarkdown(markdown);

    expect(parsed.errors).toEqual([]);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0]).toMatchObject({
      pageIdOrRoute: "guide.getting-started", humanDecision: "WAIVED", visualGateState: "PASS",
    });
    expect(signalsFromMarkdown(markdown)).toEqual({ errors: [], warnings: [], info: [] });
  });

  it("fails closed when a document contains two canonical lifecycle tables", () => {
    const parsed = parseMediaDecisionTableMarkdown(`${table(validRows.homeResolved)}\n\n## Another authority\n${table(validRows.guideResolved)}`);

    expect(parsed.decisions).toEqual([]);
    expect(parsed.errors.join("\n")).toMatch(/duplicate.*canonical.*table/i);
  });

  it("rejects a canonical table with the wrong separator width even after an explanatory table", () => {
    const markdown = table(validRows.homeResolved).replace(
      `| ${canonicalHeaders.map(() => "---").join(" | ")} |`,
      `| ${canonicalHeaders.slice(1).map(() => "---").join(" | ")} |`,
    );
    const prefix = "| Field | Purpose |\n| --- | --- |\n| notes | Explanation |\n\n";

    expect(signalsFromMarkdown(markdown).errors.join("\n")).toMatch(/separator row.*12.*13/i);
    expect(signalsFromMarkdown(prefix + markdown).errors.join("\n")).toMatch(/separator row.*12.*13/i);
  });

  it.each([
    ["home", "HIGH PRIORITY", "errors"],
    ["home", "RECOMMENDED", "info"],
    ["home", "OPTIONAL", "info"],
    ["guide.getting-started", "HIGH PRIORITY", "errors"],
    ["guide.getting-started", "RECOMMENDED", "info"],
    ["guide.getting-started", "OPTIONAL", "info"],
  ] as const)("projects explained WAIVED/PENDING for %s %s as %s pending evidence", (page, need, severity) => {
    const cells = rowCells(page === "home" ? validRows.homeResolved : validRows.guideResolved);
    cells[2] = need;
    cells[5] = "FOUND";
    cells[7] = "WAIVED";
    cells[8] = "NOT INTEGRATED";
    cells[9] = "PENDING";
    cells[11] = "Human waiver recorded; visual reviewer owns remaining review.";
    cells[12] = "";
    const signals = signalsFromMarkdown(table(markdownRow(cells)));

    expect(signals[severity]).toHaveLength(1);
    expect(signals[severity][0]).toContain(`${need} and pending`);
    for (const other of ["errors", "warnings", "info"] as const) {
      if (other !== severity) expect(signals[other]).toEqual([]);
    }
  });

  it.each(["PASS", "REVISE", "BLOCK"] as const)("preserves explained WAIVED with visual %s precedence", (visual) => {
    const cells = rowCells(validRows.guideResolved);
    cells[7] = "WAIVED";
    cells[9] = visual;
    const signals = signalsFromMarkdown(table(markdownRow(cells)));

    if (visual === "PASS") {
      expect(signals).toEqual({ errors: [], warnings: [], info: [] });
    } else {
      expect(signals.errors).toHaveLength(1);
      expect(signals.errors[0]).toContain(`blocking Human/visual state for guide.getting-started: WAIVED/${visual}`);
      expect(signals.warnings).toEqual([]);
      expect(signals.info).toEqual([]);
    }
  });

  it.each(["PASS", "PENDING"])("rejects WAIVED/%s without the required explanation fields", (visual) => {
    const cells = rowCells(validRows.guideResolved);
    cells[7] = "WAIVED";
    cells[9] = visual;
    cells[11] = "   ";
    cells[12] = "   ";
    const parsed = parseMediaDecisionTableMarkdown(table(markdownRow(cells)));

    expect(parsed.decisions).toEqual([]);
    expect(parsed.errors.join("\n")).toMatch(/requires owner_or_defer_reason/i);
  });

  it("preserves ordinary Human PENDING plus visual PENDING", () => {
    const cells = rowCells(validRows.guideResolved);
    cells[7] = "PENDING";
    cells[9] = "PENDING";
    const signals = signalsFromMarkdown(table(markdownRow(cells)));

    expect(signals.errors).toEqual([]);
    expect(signals.warnings).toEqual([]);
    expect(signals.info).toHaveLength(1);
    expect(signals.info[0]).toContain("RECOMMENDED and pending");
  });

  it("parses the V2.6.1 lifecycle table without reducing it to Priority/Status", () => {
    const parsed = parseMediaDecisionTableMarkdown(table(validRows.homeResolved));

    expect(parsed.errors).toEqual([]);
    expect(parsed.decisions[0]).toMatchObject({
      pageIdOrRoute: "home",
      mediaNeed: "HIGH PRIORITY",
      candidateState: "SEMANTICALLY VERIFIED",
      rightsState: "VERIFIED",
      humanDecision: "APPROVED",
      integrationState: "INTEGRATED",
      visualGateState: "PASS",
    });
  });

  it("requires the exact canonical header schema", () => {
    const canonical = table(validRows.homeResolved);
    const aliasHeader = canonical.replace("pageId_or_route", "PageId Or Route");
    const duplicateHeader = canonical.replace(
      "| notes |",
      "| source_or_provenance |",
    );
    const extraHeader = canonical
      .replace("| notes |", "| notes | undocumented_field |")
      .replace(
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      );

    expect(signalsFromMarkdown(aliasHeader).errors.join("\n")).toMatch(
      /non-authoritative|unknown.*PageId Or Route|exact canonical/i,
    );
    expect(signalsFromMarkdown(duplicateHeader).errors.join("\n")).toMatch(
      /duplicate.*source_or_provenance/i,
    );
    expect(signalsFromMarkdown(extraHeader).errors.join("\n")).toMatch(
      /unknown.*undocumented_field|extra.*undocumented_field/i,
    );
  });

  it("rejects rows with extra or missing data cells", () => {
    const cells = rowCells(validRows.homeResolved);
    const extraCell = markdownRow([...cells, "unexpected"]);
    const missingCell = markdownRow(cells.slice(0, -1));

    expect(signalsFromMarkdown(table(extraCell)).errors.join("\n")).toMatch(
      /row.*14.*cells.*13|row width|extra data cell/i,
    );
    expect(signalsFromMarkdown(table(missingCell)).errors.join("\n")).toMatch(
      /malformed.*row|row.*12.*cells.*13|row width/i,
    );
  });

  it("rejects empty and whitespace-only required fields", () => {
    const emptySource = validRows.homeResolved.replace("first-party", "");
    const whitespaceSource = validRows.homeResolved.replace("first-party", "   ");

    expect(signalsFromMarkdown(table(emptySource)).errors.join("\n")).toMatch(
      /requires source_or_provenance/i,
    );
    expect(signalsFromMarkdown(table(whitespaceSource)).errors.join("\n")).toMatch(
      /requires source_or_provenance/i,
    );
  });

  it.each(unconditionallyRequiredHeaders)("rejects a blank required %s field", (field) => {
    const cells = rowCells(validRows.homeResolved);
    cells[canonicalHeaders.indexOf(field)] = "   ";

    expect(signalsFromMarkdown(table(markdownRow(cells))).errors.join("\n")).toMatch(
      new RegExp(`requires ${field}`, "i"),
    );
  });

  it("accepts a normal approved integrated row with optional notes blank", () => {
    const cells = rowCells(validRows.homeResolved);
    cells[canonicalHeaders.indexOf("notes")] = "   ";

    expect(signalsFromMarkdown(table(markdownRow(cells)))).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });
  });

  it("accepts an owner-explained Human waiver with notes blank", () => {
    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | HIGH PRIORITY | The homepage normally needs media. | Hero | NOT FOUND | UNRESOLVED | WAIVED | FALLBACK ONLY | PASS | observed | Human approved launch exception. |  |",
      )),
    ).toEqual({ errors: [], warnings: [], info: [] });
  });

  it("requires notes for SOP-defined no-media, rights-risk, and non-waived fallback states", () => {
    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | NO MEDIA NEEDED | This guide remains complete as text. | none | NOT FOUND | NOT REQUIRED FOR EMBED | APPROVED | NOT INTEGRATED | PASS | original diagram | Guide owner |  |",
      )).errors.join("\n"),
    ).toMatch(/requires notes.*no-media|no-media.*requires notes/i);

    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | SEMANTICALLY VERIFIED | HUMAN RISK ACCEPTED | APPROVED | INTEGRATED | PASS | observed | Media owner |  |",
      )).errors.join("\n"),
    ).toMatch(/requires notes.*rights risk|rights risk.*requires notes/i);

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | FALLBACK ONLY | PASS | observed | Guide owner |  |",
      )).errors.join("\n"),
    ).toMatch(/requires notes.*fallback-only|fallback-only.*requires notes/i);
  });

  it("rejects a Human-waived no-media row with blank notes", () => {
    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | NO MEDIA NEEDED | This guide remains complete as text. | none | NOT FOUND | NOT REQUIRED FOR EMBED | WAIVED | NOT INTEGRATED | PASS | original diagram | Human-approved no-media owner explanation. |  |",
      )).errors.join("\n"),
    ).toMatch(/requires notes.*no-media|no-media.*requires notes/i);
  });

  it("accepts a Human-waived no-media row with required notes", () => {
    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | NO MEDIA NEEDED | This guide remains complete as text. | none | NOT FOUND | NOT REQUIRED FOR EMBED | WAIVED | NOT INTEGRATED | PASS | original diagram | Human-approved no-media owner explanation. | Approved intentional no-media exception. |",
      )),
    ).toEqual({ errors: [], warnings: [], info: [] });
  });

  it("reports malformed non-empty table rows instead of silently dropping them", () => {
    const missingTrailingDelimiter = validRows.homeResolved.replace(/\|$/, "");
    const malformed = table(validRows.homeResolved).replace(
      validRows.homeResolved,
      missingTrailingDelimiter,
    );

    expect(signalsFromMarkdown(malformed).errors.join("\n")).toMatch(
      /malformed.*row.*4|row.*4.*delimiter/i,
    );
  });

  it("rejects a structurally present all-empty data row", () => {
    const emptyRow = markdownRow(canonicalHeaders.map(() => ""));

    expect(
      signalsFromMarkdown(table(validRows.homeResolved, emptyRow)).errors.join("\n"),
    ).toMatch(/row.*malformed.*all data cells are empty/i);
  });

  it("ignores a blank text line after a valid table", () => {
    const markdown = `${table(validRows.homeResolved).trim()}\n\nFollowing prose.`;

    expect(signalsFromMarkdown(markdown)).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });
  });

  it("accepts a canonical valid table with normal leading and trailing pipes", () => {
    expect(signalsFromMarkdown(table(validRows.homeResolved))).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });
  });

  it("preserves no-table compatibility as no media readiness signal", () => {
    expect(
      collectMediaReadinessSignals({
        inventory: pageInventory,
      }),
    ).toEqual({ errors: [], warnings: [], info: [] });
  });

  it("accepts docs and root legacy table contents when only one authority exists", () => {
    expect(signalsFromMarkdown(table(validRows.homeResolved))).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });
  });

  it("fails closed for malformed schema, missing required columns, unknown enums, and dropped bad rows", () => {
    expect(signalsFromMarkdown("").errors.join("\n")).toMatch(/present but empty/i);
    expect(signalsFromMarkdown("home HIGH PRIORITY resolved").errors.join("\n")).toMatch(/Markdown table/i);
    expect(
      signalsFromMarkdown(`
| pageId_or_route | media_need |
| --- | --- |
| home | HIGH PRIORITY |
      `).errors.join("\n"),
    ).toMatch(/missing required column: candidate_state/i);
    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | CRITICAL | Hero media is essential. | Hero | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Media owner | Invalid enum fixture. |",
      )).errors.join("\n"),
    ).toMatch(/media_need.*CRITICAL/i);
    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | HIGH PRIORITY | Hero media is essential. | Hero | semantically verified | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Media owner | Invalid enum fixture. |",
      )).errors.join("\n"),
    ).toMatch(/candidate_state.*semantically verified/i);
    expect(
      signalsFromMarkdown(table(
        "|  | Homepage | HIGH PRIORITY | Hero media is essential. | Hero | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Media owner | Missing identity fixture. |",
      )).errors.join("\n"),
    ).toMatch(/requires pageId_or_route/i);
  });

  it("fails closed for duplicate, zero-match, and ambiguous Runtime Inventory resolution", () => {
    expect(
      signalsFromMarkdown(table(validRows.homeResolved, validRows.homeResolved)).errors.join("\n"),
    ).toMatch(/duplicate media decision row.*home/i);

    expect(
      signalsFromMarkdown(table(
        "| missing.page | guide/article | RECOMMENDED | A screenshot would help. | inline | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Guide owner | Missing inventory fixture. |",
      )).errors.join("\n"),
    ).toMatch(/references no Runtime Page Inventory row.*missing\.page/i);

    const ambiguousInventory = [
      pageInventory[0],
      { ...pageInventory[1], pageId: pageInventory[0].pageId },
    ];
    expect(
      signalsFromMarkdown(table(validRows.homeResolved), ambiguousInventory).errors.join("\n"),
    ).toMatch(/matches multiple Runtime Page Inventory rows.*home/i);
  });

  it("accepts valid NO MEDIA NEEDED and rejects missing rationale or conflicting states", () => {
    expect(signalsFromMarkdown(table(validRows.guideNoMedia))).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | NO MEDIA NEEDED |  | none | NOT FOUND | NOT REQUIRED FOR EMBED | APPROVED | NOT INTEGRATED | PASS | original diagram | Guide owner | Missing rationale fixture. |",
      )).errors.join("\n"),
    ).toMatch(/requires need_rationale/i);

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | NO MEDIA NEEDED | Text-only guide remains complete. | none | NOT FOUND | UNRESOLVED | APPROVED | NOT INTEGRATED | PASS | original diagram | Guide owner | Conflict fixture. |",
      )).errors.join("\n"),
    ).toMatch(/NO MEDIA NEEDED.*conflict|UNRESOLVED/i);
  });

  it("projects Human PENDING, REVISE, BLOCK, WAIVED, fallback-only, and approved integration in order", () => {
    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | FOUND | UNRESOLVED | PENDING | NOT INTEGRATED | PASS | observed | owner |  |",
      )).info.join("\n"),
    ).toMatch(/RECOMMENDED.*pending/i);

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | FOUND | UNRESOLVED | REVISE | NOT INTEGRATED | PASS | observed | owner | Revise fixture. |",
      )).errors.join("\n"),
    ).toMatch(/REVISE|blocking/i);

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | FOUND | UNRESOLVED | BLOCK | NOT INTEGRATED | PASS | observed | owner | Block fixture. |",
      )).errors.join("\n"),
    ).toMatch(/BLOCK|blocking/i);

    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | HIGH PRIORITY | The homepage normally needs media. | Hero | NOT FOUND | UNRESOLVED | WAIVED | FALLBACK ONLY | PASS | observed | Human approved launch exception. | Approved waiver fixture. |",
      )),
    ).toEqual({ errors: [], warnings: [], info: [] });

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | FOUND | UNRESOLVED | WAIVED | FALLBACK ONLY | PASS | observed |  |  |",
      )).errors.join("\n"),
    ).toMatch(/WAIVED.*notes|owner_or_defer_reason/i);

    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | FALLBACK ONLY | PASS | observed | Guide owner | Fallback-only fixture. |",
      )).info.join("\n"),
    ).toMatch(/FALLBACK ONLY.*not resolved|fallback-only/i);

    expect(signalsFromMarkdown(table(validRows.guideResolved))).toEqual({
      errors: [],
      warnings: [],
      info: [],
    });
  });

  it("blocks HIGH PRIORITY pending final readiness for home and non-home identities", () => {
    expect(
      signalsFromMarkdown(table(
        "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | FOUND | UNRESOLVED | PENDING | NOT INTEGRATED | PASS | observed | owner | Pending homepage fixture. |",
      )).errors.join("\n"),
    ).toMatch(/home.*HIGH PRIORITY.*pending|unresolved/i);

    const guide = signalsFromMarkdown(table(
      "| guide.getting-started | guide/article | HIGH PRIORITY | This guide needs important visual support. | inline | FOUND | UNRESOLVED | PENDING | NOT INTEGRATED | PASS | observed | owner | Pending guide fixture. |",
    ));
    expect(guide.errors.join("\n")).toMatch(
      /guide\.getting-started.*HIGH PRIORITY.*pending|unresolved/i,
    );
  });

  it("permits non-home HIGH PRIORITY pending only for evidence purpose", () => {
    const guide = signalsFromMarkdown(
      table(
        "| guide.getting-started | guide/article | HIGH PRIORITY | This guide needs important visual support. | inline | FOUND | UNRESOLVED | PENDING | NOT INTEGRATED | PASS | observed | owner | Pending guide fixture. |",
      ),
      pageInventory,
      "evidence",
    );

    expect(guide.errors).toEqual([]);
  });

  it("fails closed for unsupported exact state combinations", () => {
    expect(
      signalsFromMarkdown(table(
        "| guide.getting-started | guide/article | RECOMMENDED | A screenshot helps. | inline | FOUND | VERIFIED | APPROVED | NOT INTEGRATED | PASS | observed | Guide owner | Unsupported combination fixture. |",
      )).errors.join("\n"),
    ).toMatch(/unsupported media lifecycle combination/i);
  });
});
