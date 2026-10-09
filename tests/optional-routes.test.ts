import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import gameConfig from "../game.config";
import { gameConfigSchema } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import {
  buildGuideRouteRecords,
  buildSearchRouteRecords,
} from "../src/core/optional-routes";
import { parsePageInventory } from "../src/data/schemas/page-inventory";

// Route contract tests own their input; adopted projects need not ship this guide.
const base = {
  cluster: "guides", priority: 90, visibility: "public", publicationStatus: "published",
  contentStatus: "ready", developmentStatus: "ready", needsReview: false, needsUpdate: false,
  indexability: "index", publishedAt: "2026-08-10", updatedAt: "2026-09-20",
  tags: ["testing"], relatedEntityRefs: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-routes", sourceType: "editorial", accessedAt: "2026-09-20", evidenceNote: "Synthetic editorial source for optional route contract tests." }],
};
const inventory = parsePageInventory([
  { ...base, pageId: "hub.guides", route: "/guides/", pageType: "hub", module: "guides", feature: "guides",
    title: "Synthetic Guide Route Hub", primaryKeyword: "synthetic route hub",
    description: "Synthetic hub input for testing guide route generation and feature exclusion.", relatedPageIds: [] },
  { ...base, pageId: "guide.qa-routes", route: "/guides/getting-started/", pageType: "guide", module: "guides", feature: "guides",
    title: "Synthetic Guide Route Article", primaryKeyword: "synthetic route article",
    description: "Synthetic article input with a matching content slug for guide route contract tests.",
    contentRef: { collection: "guides", slug: "getting-started" }, relatedPageIds: ["hub.guides"] },
  { ...base, pageId: "search", route: "/search/", pageType: "search", module: "search", feature: "search",
    title: "Synthetic Search Route Page", primaryKeyword: "synthetic search route",
    description: "Synthetic search input for independent feature gating and a guide fallback link.", relatedPageIds: ["hub.guides"] },
]);
const fixtureConfig = gameConfigSchema.parse({
  ...gameConfig,
  features: { guides: true, heroes: false, weapons: false, items: false, maps: false,
    tierLists: false, news: false, search: true, calculator: false, planner: false },
  navigation: { groups: [{ pageId: "hub.guides", children: ["guide.qa-routes"] }, { pageId: "search" }] },
  homepage: { ...gameConfig.homepage, featuredPageIds: ["guide.qa-routes"] },
});
const gettingStarted = inventory.find(
  (page) => page.pageId === "guide.qa-routes",
)!;
const guideContent = {
  collection: "guides",
  id: "getting-started",
  data: { pageId: gettingStarted.pageId },
};

function catalogWith(
  features: Partial<(typeof fixtureConfig)["features"]>,
) {
  return buildEnabledPageCatalog(
    {
      ...fixtureConfig,
      features: { ...fixtureConfig.features, ...features },
    },
    inventory,
  );
}

describe("optional route records", () => {
  it("uses route files that can emit zero static paths", () => {
    const projectRoot = process.cwd();

    expect(existsSync(resolve(projectRoot, "src/pages/guides/index.astro"))).toBe(
      false,
    );
    expect(existsSync(resolve(projectRoot, "src/pages/search.astro"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(projectRoot, "src/pages/guides/[...slug].astro")),
    ).toBe(true);
    expect(
      existsSync(resolve(projectRoot, "src/pages/search/[...path].astro")),
    ).toBe(true);
  });

  it("emits no Guides paths when guides are disabled", () => {
    const catalog = catalogWith({ guides: false });

    expect(
      buildGuideRouteRecords(catalog, [
        { page: gettingStarted, content: guideContent },
      ]),
    ).toEqual([]);
  });

  it("emits no Search path when search is disabled", () => {
    const catalog = catalogWith({ search: false });

    expect(buildSearchRouteRecords(catalog)).toEqual([]);
  });

  it("keeps Search independent when Guides are disabled", () => {
    const catalog = catalogWith({ guides: false, search: true });

    expect(buildSearchRouteRecords(catalog)).toEqual([
      {
        path: undefined,
        page: expect.objectContaining({ pageId: "search", route: "/search/" }),
        fallbackPage: undefined,
      },
    ]);
  });

  it("preserves the existing Guides and Search URLs when enabled", () => {
    const catalog = catalogWith({ guides: true, search: true });
    const guideRecords = buildGuideRouteRecords(catalog, [
      { page: gettingStarted, content: guideContent },
    ]);

    expect(guideRecords.map((record) => record.path)).toEqual([
      undefined,
      "getting-started",
    ]);
    expect(buildSearchRouteRecords(catalog)[0]?.fallbackPage?.route).toBe(
      "/guides/",
    );
  });
});
