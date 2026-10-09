import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import EditorialArticle from "../src/components/EditorialArticle.astro";
import { pageInventory } from "../src/core/site-data";
import { pageInventoryEntrySchema } from "../src/data/schemas/page-inventory";


// Date projection tests own a complete article input independent of adoption content.
const syntheticArticle = pageInventoryEntrySchema.parse({
  pageId: "guide.qa-editorial", route: "/guides/qa-editorial/", pageType: "guide",
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  title: "Synthetic Editorial Article Guide",
  description: "Synthetic article input for independent publication, update and source checked dates.",
  primaryKeyword: "synthetic editorial article", tags: ["testing"], relatedPageIds: [], relatedEntityRefs: [],
  confidence: "high", publishedAt: "2026-08-10", updatedAt: "2026-09-20",
  sources: [{ sourceUrl: "https://example.com/qa-editorial", sourceType: "editorial", accessedAt: "2026-09-21", evidenceNote: "Synthetic source for editorial article publication and access-date tests." }],
});

describe("EditorialArticle structured identity seam", () => {
  it("uses the shared resolver and has no default author attribution", async () => {
    const source = readFileSync(new URL("../src/components/EditorialArticle.astro", import.meta.url), "utf8");
    expect(source).toContain("resolveStructuredIdentity(siteConfig, page).authorAttribution");
    expect(source).toContain("data-structured-author-id");

    const page = pageInventory.find((entry) => entry.pageType === "meta" || entry.pageType === "patch");
    if (!page) return;
    const container = await AstroContainer.create();
    const html = await container.renderToString(EditorialArticle, {
      props: { page, sectionLabel: "Update" },
      slots: { default: "<p>Body</p>" },
    });
    expect(html).not.toContain("data-structured-author-id");
    expect(html).not.toMatch(/<dt>Author<\/dt>/);
  });
});


it("renders independent freshness dates without live metadata", async () => {
  const page = { ...syntheticArticle, publishedAt: "2026-08-10", updatedAt: "2026-09-20", sources: [
    { sourceUrl: "https://example.com/qa-a", sourceType: "editorial" as const, accessedAt: "2026-09-18", evidenceNote: "Private synthetic source access evidence" },
    { sourceUrl: "https://example.com/qa-b", sourceType: "editorial" as const, accessedAt: "2026-09-21", evidenceNote: "Private synthetic source access evidence B" },
  ] };
  const container = await AstroContainer.create();
  const html = (await container.renderToString(EditorialArticle, { props: { page, sectionLabel: "QA article" }, slots: { default: "<p>Synthetic body</p>" } })).replace(/<!--.*?-->/g, "");
  expect(html).toMatch(/<dt>Published<\/dt>[\s\S]*?<time datetime="2026-08-10"/);
  expect(html).toMatch(/<dt>Last updated<\/dt>[\s\S]*?<time datetime="2026-09-20"/);
  expect(html).toMatch(/<dt>Sources checked<\/dt>[\s\S]*?<time datetime="2026-09-21"/);
  expect(html).not.toMatch(/<dt>Live status<\/dt>|Observed live|Status source|Not live telemetry|Last verified|Live now|Currently live|Private synthetic source access evidence/);
  expect(html).toContain('"datePublished":"2026-08-10"');
  expect(html).toContain('"dateModified":"2026-09-20"');
});

it("does not render live metadata for existing pages", async () => {
  const page = syntheticArticle;
  const container = await AstroContainer.create();
  const html = await container.renderToString(EditorialArticle, { props: { page, sectionLabel: "QA article" }, slots: { default: "<p>Body</p>" } });
  expect(html).not.toMatch(/Observed live|Status source|Not live telemetry|<dt>Live status<\/dt>/);
});
