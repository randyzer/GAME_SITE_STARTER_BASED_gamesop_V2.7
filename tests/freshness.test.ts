import { describe, expect, it } from "vitest";
import { pageInventoryEntrySchema } from "../src/data/schemas/page-inventory";

const page = pageInventoryEntrySchema.parse({
  pageId: "guide.qa-freshness", route: "/guides/qa-freshness/", pageType: "guide",
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  title: "Synthetic Freshness Test Guide",
  description: "Synthetic unit-test page for independent publication, update and source access dates.",
  primaryKeyword: "synthetic freshness", tags: ["testing"], relatedPageIds: [], relatedEntityRefs: [],
  confidence: "high", publishedAt: "2026-08-10", updatedAt: "2026-09-20", sources: [
  { sourceUrl: "https://example.com/qa-source-a", sourceType: "editorial" as const, accessedAt: "2026-09-18", evidenceNote: "Private synthetic source A evidence" },
  { sourceUrl: "https://example.com/qa-source-b", sourceType: "editorial" as const, accessedAt: "2026-09-21", evidenceNote: "Private synthetic source B evidence" },
] });
async function resolve(input: unknown, context?: { kind: "patch" | "version"; value: string }) {
  const module = await import("../src/core/freshness");
  return module.resolvePageFreshness(input as Parameters<typeof module.resolvePageFreshness>[0], context);
}

describe("distinct freshness facts", () => {
  it.each([
    { state: "observed-live", observedAt: "2026-09-22", sourceUrl: "https://example.com/qa-live-status", evidenceNote: "Private retired observation evidence" },
    { state: "not-live" },
  ])("rejects retired liveStatus ($state) as an unknown page field", liveStatus => {
    const result = pageInventoryEntrySchema.safeParse({ ...page, liveStatus });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["liveStatus"] }),
    ]));
  });
  it("rejects editorial update before publication without swapping dates", () => {
    expect(pageInventoryEntrySchema.safeParse({ ...page, updatedAt: "2026-08-01" }).success).toBe(false);
    expect(pageInventoryEntrySchema.safeParse({ ...page, updatedAt: page.publishedAt }).success).toBe(true);
    expect(pageInventoryEntrySchema.safeParse(page).success).toBe(true);
  });
  it("keeps publication/update/source access and patch context distinct", async () => {
    expect(await resolve(page, { kind: "patch", value: "4.2" })).toEqual({ publishedAt: "2026-08-10", updatedAt: "2026-09-20", sourceCheckedAt: "2026-09-21", versionContext: { kind: "patch", value: "4.2" } });
  });
  it("does not infer live state or version from existing dates", async () => {
    expect(await resolve(page)).toEqual({ publishedAt: "2026-08-10", updatedAt: "2026-09-20", sourceCheckedAt: "2026-09-21" });
    expect(await resolve(page, { kind: "version", value: "Reference edition A" })).toEqual({ publishedAt: "2026-08-10", updatedAt: "2026-09-20", sourceCheckedAt: "2026-09-21", versionContext: { kind: "version", value: "Reference edition A" } });
  });
  it("returns the latest source access date without mutating source order or leaking notes", async () => {
    const module = await import("../src/core/freshness");
    const sources = [...page.sources].reverse();
    const before = JSON.stringify(sources);
    expect(module.latestSourceAccessedAt(sources)).toBe("2026-09-21");
    expect(module.latestSourceAccessedAt([])).toBeUndefined();
    expect(JSON.stringify(sources)).toBe(before);
    expect(JSON.stringify(await resolve({ ...page, sources }))).not.toMatch(/evidenceNote|Private synthetic/);
  });
});
