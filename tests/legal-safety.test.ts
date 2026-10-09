import { createCoreBuildFixture } from "./helpers/core-build-fixture";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import gameConfig from "../game.config";
import { gameConfigSchema } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import { canonicalizeLegalPayload, computeLegalContentSha256, resolveLegalPageSafety, type LegalContent, type LegalContentPayload } from "../src/core/legal-safety";
import { getSitemapRoutes } from "../src/core/seo";
import { collectSiteValidationErrors } from "../src/core/site-validation";
import { legalContent } from "../src/data/legal-content";
import inventoryData from "../src/data/page-inventory.json";
import { pageInventoryEntrySchema, parsePageInventory, type PageInventoryEntry } from "../src/data/schemas/page-inventory";

const content: LegalContentPayload = {
  intro: "Synthetic policy fixture intro — 测试内容。",
  sections: [
    { heading: "Fixture section one", paragraphs: ["First fixture paragraph.", "Second fixture paragraph."] },
    { heading: "Fixture section two", paragraphs: ["Third fixture paragraph."] },
  ],
  notice: "Synthetic fixture notice.",
};

function activePage(pageType: "privacy" | "terms" = "privacy", title?: string): PageInventoryEntry {
  const page = parsePageInventory(inventoryData).find((entry) => entry.pageType === pageType)!;
  return {
    ...page,
    title: title ?? page.title,
    visibility: "public",
    publicationStatus: "published",
    publishedAt: "2026-09-01",
    contentStatus: "ready",
    developmentStatus: "ready",
    needsReview: false,
    needsUpdate: false,
    legalActivation: { state: "active", approvedContentSha256: computeLegalContentSha256(title ?? page.title, content) },
  };
}

function unavailablePage(): PageInventoryEntry {
  return { ...activePage(), visibility: "private", publicationStatus: "draft", contentStatus: "draft", legalActivation: { state: "unavailable" } };
}

describe("TL-01 legal activation and digest", () => {
  it("defaults project-owned legal content to no payload", () => {
    expect(legalContent).toEqual({});
  });

  it("treats omitted activation as unavailable", () => {
    const page = unavailablePage();
    delete page.legalActivation;
    expect(resolveLegalPageSafety(page)).toEqual({ eligible: false, errors: [] });
    expect(buildEnabledPageCatalog(gameConfig, [page])).toEqual([]);
  });

  it.each(["privacy", "terms"] as const)("excludes unavailable %s", (pageType) => {
    const page = { ...unavailablePage(), pageId: pageType, pageType, route: `/${pageType}/` };
    expect(buildEnabledPageCatalog(gameConfig, [page], { [pageType]: content })).toEqual([]);
  });

  it.each([["privacy"], ["terms"], ["privacy", "terms"]] as const)("activates only the explicitly supplied pages: %j", (...pageTypes) => {
    const inventory = parsePageInventory(inventoryData).map((page) =>
      pageTypes.some((pageType) => pageType === page.pageType) ? activePage(page.pageType as "privacy" | "terms") : page,
    );
    const payloads = Object.fromEntries(pageTypes.map((pageType) => [pageType, content]));
    const enabled = buildEnabledPageCatalog(gameConfig, inventory, payloads);
    expect(enabled.filter((page) => ["privacy", "terms"].includes(page.pageType)).map((page) => page.pageType)).toEqual(pageTypes);
  });

  it("requires real resolved legal content even when the catalog context is omitted", () => {
    expect(resolveLegalPageSafety(activePage()).errors.join("\n")).toMatch(/content/i);
    expect(() => buildEnabledPageCatalog(gameConfig, [activePage()])).toThrow(/content/i);
  });

  it.each([
    { state: "active" },
    { state: "active", approvedContentSha256: "" },
    { state: "active", approvedContentSha256: "a".repeat(63) },
    { state: "active", approvedContentSha256: "A".repeat(64) },
    { state: "active", approvedContentSha256: "g".repeat(64) },
    { state: "unavailable", approvedContentSha256: "a".repeat(64) },
    { state: "pending" },
    { state: "unavailable", reviewer: "fixture" },
  ])("rejects invalid/extra activation fields: %j", (legalActivation) => {
    expect(pageInventoryEntrySchema.safeParse({ ...activePage(), legalActivation }).success).toBe(false);
    expect(resolveLegalPageSafety({ ...activePage(), legalActivation } as PageInventoryEntry, { privacy: content }).errors.length).toBeGreaterThan(0);
  });

  it("rejects legalActivation on non-legal pages", () => {
    const home = inventoryData.find((page) => page.pageType === "home")!;
    expect(pageInventoryEntrySchema.safeParse({ ...home, legalActivation: { state: "unavailable" } }).success).toBe(false);
  });

  it("rejects stale approved content rather than hiding it", () => {
    const page = activePage();
    page.legalActivation = { state: "active", approvedContentSha256: "0".repeat(64) };
    expect(resolveLegalPageSafety(page, { privacy: content }).errors.join("\n")).toMatch(/digest|sha256/i);
    expect(() => buildEnabledPageCatalog(gameConfig, [page], { privacy: content })).toThrow(/digest|sha256/i);
  });

  it.each([
    ["visibility", "private"], ["publicationStatus", "draft"],
    ["contentStatus", "draft"], ["contentStatus", "review"], ["contentStatus", "stale"],
    ["developmentStatus", "building"], ["developmentStatus", "blocked"],
    ["needsReview", true], ["needsUpdate", true], ["publishedAt", undefined],
  ])("rejects incompatible active %s=%s before catalog filtering", (field, value) => {
    const page = { ...activePage(), [field]: value };
    const result = resolveLegalPageSafety(page, { privacy: content });
    expect(result.eligible).toBe(false);
    expect(result.errors.join("\n")).toContain(field);
    expect(() => buildEnabledPageCatalog(gameConfig, [page], { privacy: content })).toThrow(field);
  });

  it.each([
    { visibility: "public", publicationStatus: "published" },
    { indexability: "index" },
  ] as const)("rejects contradictory unavailable state: %j", (flags) => {
    const page = { ...unavailablePage(), ...flags };
    expect(resolveLegalPageSafety(page).errors.join("\n")).toMatch(/unavailable/i);
    expect(() => buildEnabledPageCatalog(gameConfig, [page])).toThrow(/unavailable/i);
  });

  it("rejects unavailable public draft pages even with noindex", () => {
    const page = { ...unavailablePage(), visibility: "public" as const, indexability: "noindex" as const };
    const result = resolveLegalPageSafety(page);
    expect(result.eligible).toBe(false);
    expect(result.errors.join("\n")).toContain("visibility=public");
    expect(() => buildEnabledPageCatalog(gameConfig, [page])).toThrow("visibility=public");
  });

  it.each(["published", "scheduled", "archived"] as const)("rejects unavailable private pages with publicationStatus=%s", (publicationStatus) => {
    const page = { ...unavailablePage(), publicationStatus };
    const result = resolveLegalPageSafety(page);
    expect(result.eligible).toBe(false);
    expect(result.errors.join("\n")).toContain("publicationStatus=draft");
    expect(() => buildEnabledPageCatalog(gameConfig, [page])).toThrow("publicationStatus=draft");
  });

  it("accepts unavailable unlisted draft noindex pages as coherent", () => {
    const page = { ...unavailablePage(), visibility: "unlisted" as const, indexability: "noindex" as const };
    expect(resolveLegalPageSafety(page)).toEqual({ eligible: false, errors: [] });
    expect(buildEnabledPageCatalog(gameConfig, [page])).toEqual([]);
  });

  it("rejects unsupported legal routes and duplicate legal page types", () => {
    expect(resolveLegalPageSafety({ ...activePage(), route: "/privacy/alias/" }, { privacy: content }).errors.join("\n")).toMatch(/route/i);
    const duplicate = { ...unavailablePage(), pageId: "privacy.other", route: "/privacy/other/", primaryKeyword: "another privacy policy" };
    expect(() => parsePageInventory([unavailablePage(), duplicate])).toThrow(/privacy/i);
  });

  it.each([
    undefined, {}, { ...content, intro: " " }, { ...content, intro: 7 },
    { ...content, sections: [] }, { ...content, sections: [undefined] },
    { ...content, sections: [{ heading: "", paragraphs: ["Text"] }] },
    { ...content, sections: [{ heading: "Heading", paragraphs: [] }] },
    { ...content, sections: [{ heading: "Heading", paragraphs: [" "] }] },
    { ...content, route: "/privacy/" }, { ...content, notice: null },
  ])("rejects malformed/empty required content: %j", (payload) => {
    expect(() => computeLegalContentSha256(activePage().title, payload)).toThrow();
    expect(resolveLegalPageSafety(activePage(), { privacy: payload } as LegalContent).errors.join("\n")).toMatch(/content/i);
  });

  it("uses fixed UTF-8 JSON key order with absent notice represented as null", () => {
    const payload = { intro: "Intro", sections: [{ heading: "Heading", paragraphs: ["Text"] }] };
    const expected = '{"title":"Policy title","intro":"Intro","sections":[{"heading":"Heading","paragraphs":["Text"]}],"notice":null}';
    expect(canonicalizeLegalPayload("Policy title", payload)).toBe(expected);
    expect(computeLegalContentSha256("Policy title", payload)).toBe(createHash("sha256").update(expected, "utf8").digest("hex"));
  });

  it("does not depend on object construction order", () => {
    const reordered = { notice: content.notice, sections: content.sections.map((section) => ({ paragraphs: section.paragraphs, heading: section.heading })), intro: content.intro };
    expect(computeLegalContentSha256("Policy title", reordered)).toBe(computeLegalContentSha256("Policy title", content));
  });

  it("normalizes CRLF and CR to LF across every policy-facing string", () => {
    const lf = { intro: "Intro\nLine", sections: [{ heading: "Heading\nLine", paragraphs: ["Text\nLine"] }], notice: "Notice\nLine" };
    for (const newline of ["\r\n", "\r"]) {
      const variant = JSON.parse(JSON.stringify(lf).replaceAll("\\n", newline === "\r" ? "\\r" : "\\r\\n"));
      expect(computeLegalContentSha256(`Policy${newline}title`, variant)).toBe(computeLegalContentSha256("Policy\ntitle", lf));
    }
  });

  it("hashes Unicode deterministically without erasing Unicode distinctions", () => {
    const payload = { ...content, intro: "中文 🧭 café" };
    const digest = computeLegalContentSha256("Policy title", payload);
    expect(digest).toBe(computeLegalContentSha256("Policy title", structuredClone(payload)));
    expect(digest).not.toBe(computeLegalContentSha256("Policy title", { ...payload, intro: "中文 🧭 cafe\u0301" }));
  });

  it.each(["title", "intro", "heading", "paragraph", "section order", "paragraph order", "notice"])("invalidates approval after a %s change", (field) => {
    const page = activePage();
    const payload = structuredClone(content);
    if (field === "title") page.title += "!";
    if (field === "intro") payload.intro += "!";
    if (field === "heading") payload.sections[0].heading += "!";
    if (field === "paragraph") payload.sections[0].paragraphs[0] += "!";
    if (field === "section order") payload.sections.reverse();
    if (field === "paragraph order") payload.sections[0].paragraphs.reverse();
    if (field === "notice") payload.notice += "!";
    expect(resolveLegalPageSafety(page, { privacy: payload }).errors.join("\n")).toMatch(/digest|sha256/i);
  });

  it.each(["Intro", "intro ", "intro!", " intro"])("preserves meaningful case, punctuation and spaces: %s", (intro) => {
    expect(computeLegalContentSha256("Policy title", { ...content, intro })).not.toBe(computeLegalContentSha256("Policy title", { ...content, intro: "intro" }));
  });

  it("distinguishes absent notice from an explicitly empty notice", () => {
    const { notice: _notice, ...withoutNotice } = content;
    expect(computeLegalContentSha256("Policy title", withoutNotice)).not.toBe(computeLegalContentSha256("Policy title", { ...withoutNotice, notice: "" }));
  });

  it("keeps approval valid through technical timestamp and metadata changes", () => {
    const page = { ...activePage(), updatedAt: "2026-10-01", publishedAt: "2026-09-02", description: "An unrelated technical description remains outside policy approval." };
    expect(resolveLegalPageSafety(page, { privacy: content }).errors).toEqual([]);
    expect(resolveLegalPageSafety(page, { privacy: content }).eligible).toBe(true);
  });

  it("retains active noindex routes without adding sitemap/search eligibility", () => {
    const page = activePage();
    const enabled = buildEnabledPageCatalog(gameConfig, [page], { privacy: content });
    expect(enabled).toEqual([page]);
    expect(getSitemapRoutes(enabled)).toEqual([]);
  });

  it("aggregates invalid legal activation with independent validation errors", () => {
    const page = activePage();
    page.legalActivation = { state: "active", approvedContentSha256: "0".repeat(64) };
    const config = { ...gameConfig, navigation: { groups: [] }, homepage: { featuredPageIds: ["missing.home"] } };
    const errors = collectSiteValidationErrors({ config, inventory: [page], legalContent: { privacy: content }, contentEntries: [], factModules: {}, fixedRoutes: ["/"], implementedPageTypes: ["privacy"] });
    expect(errors.join("\n")).toMatch(/digest|sha256/i);
    expect(errors.join("\n")).toMatch(/fixed route/i);
    expect(errors.join("\n")).toMatch(/homepage/i);
  });

  it("does not mutate activation or auto-write approval", () => {
    const page = activePage();
    const before = JSON.stringify(page);
    buildEnabledPageCatalog(gameConfig, [page], { privacy: content });
    expect(JSON.stringify(page)).toBe(before);
  });
});

describe("TL-01 actual static route output", () => {
  it.each([
    { active: ["privacy"], index: [] },
    { active: ["terms"], index: ["terms"] },
    { active: ["privacy", "terms"], index: ["privacy"] },
  ])("renders approved payload and projects only eligible routes: %j", ({ active, index }) => {
    const root = createCoreBuildFixture("starter-tl01-build-");
    try {
      const payloads = Object.fromEntries(active.map((pageType) => [pageType, content]));
      const inventory = parsePageInventory(JSON.parse(readFileSync(join(root, "src/data/page-inventory.json"), "utf8"))).map((page) => active.includes(page.pageType)
        ? { ...activePage(page.pageType as "privacy" | "terms", page.title), sources: page.sources, indexability: index.includes(page.pageType) ? "index" as const : "noindex" as const }
        : page);
      writeFileSync(join(root, "src/data/page-inventory.json"), JSON.stringify(inventory));
      writeFileSync(join(root, "src/data/legal-content.ts"), `export const legalContent = ${JSON.stringify(payloads)};\n`);
      const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" }, timeout: 60_000 });
      const log = `${build.stdout}\n${build.stderr}`;
      expect(build.error, log).toBeUndefined();
      expect(build.status, log).toBe(0);
      const serializedConfig = readFileSync(join(root, "game.config.ts"), "utf8").match(
        /^import \{ defineGameConfig \} from "\.\/src\/config\/schema";\n\nexport default defineGameConfig\((\{[\s\S]*\})\);\n$/,
      );
      if (!serializedConfig) throw new Error("Unexpected synthetic fixture config serialization.");
      const fixtureConfig = gameConfigSchema.parse(JSON.parse(serializedConfig[1]));
      const enabled = buildEnabledPageCatalog(fixtureConfig, inventory, payloads);
      expect(log).toContain(`Static output reconciliation passed: ${enabled.length} inventory routes matched.`);
      expect(log).toMatch(new RegExp(`Indexed ${getSitemapRoutes(enabled).length} pages?`));
      const sitemap = readFileSync(join(root, "dist/sitemap-0.xml"), "utf8");
      const home = readFileSync(join(root, "dist/index.html"), "utf8");
      for (const pageType of ["privacy", "terms"]) {
        const output = join(root, `dist/${pageType}/index.html`);
        expect(existsSync(output)).toBe(active.includes(pageType));
        expect(home.includes(`href="/${pageType}/"`)).toBe(active.includes(pageType));
        expect(sitemap.includes(`/${pageType}/</loc>`)).toBe(index.includes(pageType));
        if (!active.includes(pageType)) continue;
        const html = readFileSync(output, "utf8");
        expect(html).toContain(content.intro);
        expect(html).toContain(content.sections[0].paragraphs[0]);
        expect(html).toContain(content.notice);
        expect(html).not.toMatch(/Last reviewed|Starter disclosure|Starter conditions|Operator action required|qualified legal review/);
        expect(html).toContain('rel="canonical"');
        expect(html).toContain('application/ld+json');
        expect(/data-pagefind-body(?:[\s=>])/.test(html)).toBe(index.includes(pageType));
        const other = pageType === "privacy" ? "terms" : "privacy";
        expect(html.includes(`href="/${other}/"`)).toBe(active.includes(other));
      }
      expect(home).not.toContain("These starter terms describe");
      expect(existsSync(join(root, "dist/about/index.html"))).toBe(true);
      expect(existsSync(join(root, "dist/404.html"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
