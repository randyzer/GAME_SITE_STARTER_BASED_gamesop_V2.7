import { createCoreBuildFixture } from "./helpers/core-build-fixture";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EVIDENCE_MARKER_FILE,
  TECHNICAL_BUILD_STAGES,
  runBuild,
  type BuildCommand,
} from "../scripts/build-site";

const canonicalHeader =
  "| pageId_or_route | page_family | media_need | need_rationale | intended_placement | candidate_state | rights_state | human_decision | integration_state | visual_gate_state | source_or_provenance | owner_or_defer_reason | notes |";
const separator = `| ${Array.from({ length: 13 }, () => "---").join(" | ")} |`;
const pendingRow =
  "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | FOUND | UNRESOLVED | PENDING | FALLBACK ONLY | PENDING | observed | Media owner | Pending fallback-only Human review fixture. |";
const approvedRow =
  "| home | Homepage | HIGH PRIORITY | The homepage hero needs recognizable game identity. | Hero | SEMANTICALLY VERIFIED | VERIFIED | APPROVED | INTEGRATED | PASS | first-party | Media owner | Approved fixture. |";
const reviseRow = approvedRow.replace("| APPROVED |", "| REVISE |");
const blockRow = approvedRow.replace("| APPROVED |", "| BLOCK |");
const unsupportedRow = approvedRow.replace("| INTEGRATED |", "| NOT INTEGRATED |");

let fixtureRoot: string;

function table(row: string): string {
  return `${canonicalHeader}\n${separator}\n${row}\n`;
}

function writeDecisionTable(markdown: string): string {
  const path = join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md");
  mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
  writeFileSync(path, markdown);
  return path;
}

function run(command: "build" | "build:evidence" | "validate", args: string[] = []) {
  return spawnSync("npm", ["run", command, ...(args.length > 0 ? ["--", ...args] : [])], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 60_000,
  });
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

beforeAll(() => {
  fixtureRoot = createCoreBuildFixture();

});

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("shared final/evidence build contract", () => {
  it("uses one exact technical stage definition and stops on first failed stage", () => {
    const finalCalls: BuildCommand[] = [];
    const evidenceCalls: BuildCommand[] = [];
    expect(runBuild({
      purpose: "final",
      projectRoot: fixtureRoot,
      runCommand: (command) => {
        finalCalls.push(command);
        return 0;
      },
      log: () => undefined,
    })).toBe(0);
    expect(runBuild({
      purpose: "evidence",
      projectRoot: fixtureRoot,
      runCommand: (command) => {
        evidenceCalls.push(command);
        return 0;
      },
      log: () => undefined,
    })).toBe(0);

    expect(finalCalls.slice(1, -1)).toEqual(TECHNICAL_BUILD_STAGES.slice(0, -1));
    expect(evidenceCalls.slice(1, -1)).toEqual(TECHNICAL_BUILD_STAGES.slice(0, -1));
    expect(finalCalls.at(-1)?.args).toEqual(["scripts/audit-build.ts", "--purpose", "final"]);
    expect(evidenceCalls.at(-1)?.args).toEqual(["scripts/audit-build.ts", "--purpose", "evidence"]);

    const stopped: string[] = [];
    const failure = runBuild({
      purpose: "evidence",
      projectRoot: fixtureRoot,
      runCommand: (command) => {
        stopped.push(command.name);
        return command.name === "Pagefind normalization" ? 23 : 0;
      },
      log: () => undefined,
    });
    expect(failure).toBe(23);
    expect(stopped).toEqual([
      "Evidence-safe validation",
      "Astro build",
      "Output reconciliation",
      "Pagefind generation",
      "Pagefind normalization",
    ]);
  });

  it("fails closed when marker survives a nominal final technical pipeline", () => {
    const markerPath = join(fixtureRoot, EVIDENCE_MARKER_FILE);
    mkdirSync(join(fixtureRoot, "dist"), { recursive: true });
    writeFileSync(markerPath, JSON.stringify({ mode: "evidence", final: false }));

    expect(runBuild({
      purpose: "final",
      projectRoot: fixtureRoot,
      runCommand: () => 0,
      log: () => undefined,
    })).toBe(1);
    rmSync(markerPath);
  });

  it("removes a prior evidence marker before preflight and technical failures", () => {
    const markerPath = join(fixtureRoot, EVIDENCE_MARKER_FILE);
    const successfulEvidenceAttempt = () => runBuild({
      purpose: "evidence",
      projectRoot: fixtureRoot,
      runCommand: () => 0,
      log: () => undefined,
    });

    expect(successfulEvidenceAttempt()).toBe(0);
    expect(existsSync(markerPath)).toBe(true);
    expect(runBuild({
      purpose: "evidence",
      projectRoot: fixtureRoot,
      runCommand: () => 17,
      log: () => undefined,
    })).toBe(17);
    expect(existsSync(markerPath)).toBe(false);

    expect(successfulEvidenceAttempt()).toBe(0);
    expect(existsSync(markerPath)).toBe(true);
    expect(runBuild({
      purpose: "evidence",
      projectRoot: fixtureRoot,
      runCommand: (command) => command.name === "Pagefind normalization" ? 23 : 0,
      log: () => undefined,
    })).toBe(23);
    expect(existsSync(markerPath)).toBe(false);
  });

  it("rejects public evidence-purpose validate arguments", () => {
    writeDecisionTable(table(pendingRow));
    const bypass = run("validate", ["--purpose", "evidence"]);

    expect(bypass.status).not.toBe(0);
    expect(`${bypass.stdout}\n${bypass.stderr}`).toMatch(/unsupported.*argument|final-only/i);
  });

  it("allows HIGH PRIORITY Human/visual PENDING only for evidence without lifecycle mutation", () => {
    const decisionPath = writeDecisionTable(table(pendingRow));
    const before = readFileSync(decisionPath, "utf8");

    expect(run("validate").status).not.toBe(0);
    expect(run("build").status).not.toBe(0);
    const evidence = run("build:evidence");

    expect(evidence.status, evidence.stderr).toBe(0);
    expect(`${evidence.stdout}\n${evidence.stderr}`).toMatch(/FRESH VISUAL EVIDENCE BUILD/i);
    expect(`${evidence.stdout}\n${evidence.stderr}`).toMatch(/NOT FINAL CLOSING BUILD/i);
    expect(`${evidence.stdout}\n${evidence.stderr}`).toMatch(/HUMAN REVIEW REQUIRED/i);
    expect(readFileSync(decisionPath, "utf8")).toBe(before);
    expect(JSON.parse(readFileSync(join(fixtureRoot, EVIDENCE_MARKER_FILE), "utf8"))).toEqual({
      mode: "evidence",
      final: false,
    });
  }, 60_000);

  it("keeps evidence metadata out of public output except for marker", () => {
    const publicOutput = collectFiles(join(fixtureRoot, "dist"))
      .filter((path) => path !== join(fixtureRoot, EVIDENCE_MARKER_FILE))
      .filter((path) => /\.(?:html|js|css|json)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(publicOutput).not.toContain('"mode":"evidence"');
    expect(publicOutput).not.toContain("Pending Human review fixture");
    expect(publicOutput).not.toContain("visual_gate_state");
  });

  it("lets final PASS rebuild remove evidence marker", () => {
    writeDecisionTable(table(approvedRow));
    const final = run("build");

    expect(final.status, final.stderr).toBe(0);
    expect(existsSync(join(fixtureRoot, EVIDENCE_MARKER_FILE))).toBe(false);
  }, 60_000);

  it("makes the generated-output audit independently reject an evidence marker", () => {
    writeDecisionTable(table(approvedRow));
    expect(run("build").status).toBe(0);

    const cleanAudit = spawnSync("npm", ["exec", "--", "tsx", "scripts/audit-build.ts"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 60_000,
    });
    expect(cleanAudit.status, cleanAudit.stderr).toBe(0);

    writeFileSync(
      join(fixtureRoot, EVIDENCE_MARKER_FILE),
      `${JSON.stringify({ mode: "evidence", final: false }, null, 2)}\n`,
    );
    const markedAudit = spawnSync("npm", ["exec", "--", "tsx", "scripts/audit-build.ts"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 60_000,
    });
    expect(markedAudit.status).not.toBe(0);
    expect(`${markedAudit.stdout}\n${markedAudit.stderr}`).toMatch(
      /EVIDENCE_BUILD_NOT_FINAL\.json.*final|final.*EVIDENCE_BUILD_NOT_FINAL\.json/i,
    );
    rmSync(join(fixtureRoot, EVIDENCE_MARKER_FILE));
  }, 60_000);

  it.each([
    ["REVISE", reviseRow],
    ["BLOCK", blockRow],
  ])("keeps %s blocking for evidence and final builds", (_label, row) => {
    writeDecisionTable(table(row));
    expect(run("build:evidence").status).not.toBe(0);
    expect(run("build").status).not.toBe(0);
  }, 60_000);

  it("fails evidence preflight for malformed authority", () => {
    writeDecisionTable("| broken | table |\n| --- | --- |\n| x | y |\n");
    expect(run("build:evidence").status).not.toBe(0);
  });

  it("fails evidence preflight for unsupported lifecycle combination", () => {
    writeDecisionTable(table(unsupportedRow));
    expect(run("build:evidence").status).not.toBe(0);
  });
});
