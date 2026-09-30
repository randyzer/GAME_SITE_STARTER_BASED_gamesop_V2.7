import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import gameConfig from "../game.config";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import {
  parsePageInventory,
  type PageInventoryEntry,
} from "../src/data/schemas/page-inventory";

const basePage: PageInventoryEntry = {
  pageId: "home",
  route: "/",
  pageType: "home",
  cluster: "core",
  module: "core",
  priority: 100,
  visibility: "public",
  publicationStatus: "published",
  contentStatus: "ready",
  developmentStatus: "ready",
  needsReview: false,
  needsUpdate: false,
  indexability: "index",
  title: "Game Atlas — Guides, Builds & Game Data",
  description:
    "Find clear, source-aware game guides and reference data in a fast, focused experience.",
  publishedAt: "2026-09-01",
  updatedAt: "2026-09-01",
  primaryKeyword: "game guides",
  tags: ["guides", "reference"],
  relatedPageIds: [],
  relatedEntityRefs: [],
  sources: [
    {
      sourceUrl: "https://gameatlas.example/",
      sourceType: "editorial",
      accessedAt: "2026-09-01",
      evidenceNote: "Starter editorial copy; replace before production launch.",
    },
  ],
  confidence: "high",
};

function page(overrides: Partial<PageInventoryEntry> = {}) {
  return { ...basePage, ...overrides } satisfies PageInventoryEntry;
}

function omitPublishedAt(entry: PageInventoryEntry) {
  const result: Partial<PageInventoryEntry> = { ...entry };
  delete result.publishedAt;
  return result;
}

describe("parsePageInventory", () => {
  it("accepts workflow fields and Astro's special 404 route", () => {
    const [notFoundPage] = parsePageInventory([
      {
        ...basePage,
        pageId: "not-found",
        route: "/404.html",
        pageType: "not-found",
        cluster: "core",
        module: "core",
        needsReview: false,
        needsUpdate: false,
        indexability: "noindex",
        primaryKeyword: "page not found",
      },
    ]);

    expect(notFoundPage.route).toBe("/404.html");
    expect(notFoundPage.needsUpdate).toBe(false);
  });

  it("rejects duplicate page IDs", () => {
    expect(() =>
      parsePageInventory([
        basePage,
        page({ route: "/guides/", pageType: "guide" }),
      ]),
    ).toThrow(/pageId/i);
  });

  it("rejects duplicate routes", () => {
    expect(() =>
      parsePageInventory([
        basePage,
        page({ pageId: "guide.start", pageType: "guide" }),
      ]),
    ).toThrow(/route/i);
  });

  it("rejects a route without a leading and trailing slash", () => {
    expect(() =>
      parsePageInventory([
        page({ pageId: "guide.start", route: "guides/start" }),
      ]),
    ).toThrow(/route/i);
  });

  it("rejects duplicate normalized primary keywords", () => {
    expect(() =>
      parsePageInventory([
        basePage,
        page({
          pageId: "guide.intent-copy",
          route: "/guides/intent-copy/",
          pageType: "guide",
          primaryKeyword: " Game Guides ",
        }),
      ]),
    ).toThrow(/primary keyword/i);
  });

  it("requires publishedAt for a public published page", () => {
    expect(() => parsePageInventory([omitPublishedAt(basePage)])).toThrow(
      /publishedAt/i,
    );
  });

  it("allows public drafts and private pages to omit publishedAt", () => {
    const inventory = parsePageInventory([
      omitPublishedAt(
        page({
          pageId: "guide.draft",
          route: "/guides/draft/",
          pageType: "guide",
          publicationStatus: "draft",
          indexability: "noindex",
          primaryKeyword: "draft game guide",
        }),
      ),
      omitPublishedAt(
        page({
          pageId: "guide.private",
          route: "/guides/private/",
          pageType: "guide",
          visibility: "private",
          indexability: "noindex",
          primaryKeyword: "private game guide",
        }),
      ),
    ]);

    expect(inventory.map((entry) => entry.publishedAt)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("still validates publishedAt when a non-live page provides it", () => {
    expect(() =>
      parsePageInventory([
        page({
          publicationStatus: "draft",
          indexability: "noindex",
          publishedAt: "09-01-2026",
        }),
      ]),
    ).toThrow(/publishedAt/i);
  });
});

describe("buildEnabledPageCatalog", () => {
  it.each(["privacy", "terms"] as const)(
    "omitted activation leaves %s unavailable even with live inventory flags",
    (pageType) => {
      expect(() => buildEnabledPageCatalog(gameConfig, [page({
        pageId: pageType,
        pageType,
        route: `/${pageType}/`,
        indexability: "noindex",
      })])).toThrow(/unavailable/i);
    },
  );

  it("ships no enabled legal routes and keeps both inventory identities", () => {
    const inventory = parsePageInventory(JSON.parse(readFileSync(
      new URL("../src/data/page-inventory.json", import.meta.url), "utf8",
    )));
    expect(inventory.filter((entry) => ["privacy", "terms"].includes(entry.pageType))).toHaveLength(2);
    expect(buildEnabledPageCatalog(gameConfig, inventory).map((entry) => entry.route))
      .not.toEqual(expect.arrayContaining(["/privacy/", "/terms/"]));
    for (const entry of inventory.filter((entry) => ["privacy", "terms"].includes(entry.pageType))) {
      expect(entry.visibility).toBe("private");
      expect(entry.publicationStatus).toBe("draft");
      expect(entry.contentStatus).toBe("draft");
      expect(entry.indexability).toBe("noindex");
    }
  });
  it("excludes a page owned by a disabled feature", () => {
    const inventory = parsePageInventory([
      basePage,
      page({
        pageId: "hero.demo-sentinel",
        route: "/heroes/demo-sentinel/",
        pageType: "hero",
        feature: "heroes",
        primaryKeyword: "demo sentinel guide",
        entityRef: { entityType: "hero", entityId: "demo-sentinel" },
      }),
    ]);

    const config = {
      ...gameConfig,
      features: { ...gameConfig.features, heroes: false },
    };

    expect(buildEnabledPageCatalog(config, inventory)).toEqual([basePage]);
  });

  it("excludes an unpublished page", () => {
    const inventory = parsePageInventory([
      basePage,
      page({
        pageId: "guide.draft",
        route: "/guides/draft/",
        pageType: "guide",
        publicationStatus: "draft",
        primaryKeyword: "draft game guide",
      }),
    ]);

    expect(buildEnabledPageCatalog(gameConfig, inventory)).toEqual([basePage]);
  });

  it("keeps a published noindex page routable", () => {
    const noindexPage = page({
      pageId: "guide.utility",
      route: "/guides/utility/",
      pageType: "guide",
      indexability: "noindex",
      primaryKeyword: "utility game guide",
    });
    const inventory = parsePageInventory([basePage, noindexPage]);

    expect(buildEnabledPageCatalog(gameConfig, inventory)).toContainEqual(
      noindexPage,
    );
  });

  it("parses the project inventory and applies its current publication and feature gates", () => {
    const inventoryUrl = new URL(
      "../src/data/page-inventory.json",
      import.meta.url,
    );
    const inventory = parsePageInventory(
      JSON.parse(readFileSync(inventoryUrl, "utf8")),
    );
    const routes = buildEnabledPageCatalog(gameConfig, inventory).map(
      (entry) => entry.route,
    );

    for (const entry of inventory) {
      const shouldBeEnabled =
        entry.visibility === "public" &&
        entry.publicationStatus === "published" &&
        (!entry.feature || gameConfig.features[entry.feature]);

      expect(routes.includes(entry.route), entry.pageId).toBe(shouldBeEnabled);
    }
  });
});
