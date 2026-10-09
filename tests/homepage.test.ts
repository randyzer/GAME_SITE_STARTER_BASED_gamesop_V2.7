import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { buildHomepageModel } from "../src/components/home/home-model";
import { defineGameConfig } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import {
  pageInventory,
  featuredHomepagePages,
  enabledPageCatalog,
  siteConfig,
} from "../src/core/site-data";
import type { PageInventoryEntry } from "../src/data/schemas/page-inventory";
import HomePage from "../src/pages/index.astro";
import { createMediaCatalog, mediaCatalog } from "../src/data/media/catalog";

type AstroComponent = Parameters<AstroContainer["renderToString"]>[0];
const homeComponents = import.meta.glob<{ default: AstroComponent }>(
  "../src/components/home/*.astro",
);
const wikiComponents = import.meta.glob<{ default: AstroComponent }>(
  "../src/components/wiki/*.astro",
);
const indexUrl = new URL("../src/pages/index.astro", import.meta.url);
const contentConfigUrl = new URL("../src/content.config.ts", import.meta.url);
const globalStylesUrl = new URL("../src/styles/global.css", import.meta.url);
const gameConfigUrl = new URL("../game.config.ts", import.meta.url);

const homePage = pageInventory.find((page) => page.pageId === "home")!;

function fixturePage(
  overrides: Pick<PageInventoryEntry, "pageId" | "route"> &
    Partial<PageInventoryEntry>,
): PageInventoryEntry {
  return {
    ...homePage,
    pageType: "guide",
    module: "guides",
    feature: "guides",
    priority: 50,
    title: `Fixture page ${overrides.pageId}`,
    description: `Fixture description for ${overrides.pageId} with enough detail for a player-facing page card.`,
    primaryKeyword: `fixture keyword ${overrides.pageId}`,
    relatedPageIds: [],
    relatedEntityRefs: [],
    ...overrides,
  };
}

function pageIds(pages: readonly PageInventoryEntry[]) {
  return pages.map((page) => page.pageId);
}

function surfacedPageIds(model: ReturnType<typeof buildHomepageModel>) {
  return [
    ...model.startHere,
    ...model.categories,
    ...model.featuredGuides,
    ...model.importantSystems,
    ...model.latestUpdates,
    ...model.browseAll,
  ].map((page) => page.pageId);
}

function source(url: URL) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

async function renderComponent(
  components: Record<string, () => Promise<{ default: AstroComponent }>>,
  path: string,
  props: Record<string, unknown>,
) {
  const load = components[path];
  expect(load, `${path} component exists`).toBeTypeOf("function");
  if (!load) return "";
  const { default: component } = await load();
  const container = await AstroContainer.create();
  return container.renderToString(component, { props });
}

describe("homepage model", () => {
  it("provides the pure homepage model boundary", async () => {
    await expect(
      import("../src/components/home/home-model"),
    ).resolves.toHaveProperty("buildHomepageModel");
  });

  it("uses configured featured order for Start Here and remaining featured guides", () => {
    const first = fixturePage({ pageId: "guide.first", route: "/guides/first/" });
    const second = fixturePage({ pageId: "guide.second", route: "/guides/second/" });

    const model = buildHomepageModel({
      enabledPages: [homePage, first, second],
      featuredPages: [second, first],
    });

    expect(pageIds(model.startHere)).toEqual(["guide.second"]);
    expect(model.heroStartPage?.pageId).toBe("guide.second");
    expect(pageIds(model.featuredGuides)).toEqual(["guide.first"]);
  });

  it("chooses one enabled Hub or database root per module and keeps remaining roots as important systems", () => {
    const lowerGuideHub = fixturePage({
      pageId: "hub.guides.secondary",
      route: "/guides/advanced/",
      pageType: "hub",
      priority: 70,
    });
    const guideRoot = fixturePage({
      pageId: "hub.guides",
      route: "/guides/",
      pageType: "hub",
      priority: 95,
    });
    const heroRoot = fixturePage({
      pageId: "database.heroes",
      route: "/heroes/",
      pageType: "database",
      module: "heroes",
      feature: "heroes",
      priority: 90,
    });

    const model = buildHomepageModel({
      enabledPages: [homePage, lowerGuideHub, heroRoot, guideRoot],
      featuredPages: [],
    });

    expect(pageIds(model.categories)).toEqual(["hub.guides", "database.heroes"]);
    expect(pageIds(model.importantSystems)).toEqual(["hub.guides.secondary"]);
  });

  it("sorts enabled patch pages by updatedAt with a stable tie-break", () => {
    const older = fixturePage({
      pageId: "patch.older",
      route: "/news/older/",
      pageType: "patch",
      module: "news",
      feature: "news",
      updatedAt: "2026-08-01",
    });
    const newerLowPriority = fixturePage({
      pageId: "patch.newer-low",
      route: "/news/newer-low/",
      pageType: "patch",
      module: "news",
      feature: "news",
      priority: 40,
      updatedAt: "2026-09-01",
    });
    const newerHighPriority = fixturePage({
      pageId: "patch.newer-high",
      route: "/news/newer-high/",
      pageType: "patch",
      module: "news",
      feature: "news",
      priority: 80,
      updatedAt: "2026-09-01",
    });

    const model = buildHomepageModel({
      enabledPages: [older, newerLowPriority, newerHighPriority],
      featuredPages: [],
    });

    expect(pageIds(model.latestUpdates)).toEqual([
      "patch.newer-high",
      "patch.newer-low",
      "patch.older",
    ]);
  });

  it("inherits draft, private and feature-disabled leak prevention from the enabled catalog", () => {
    const publicGuide = fixturePage({
      pageId: "guide.public",
      route: "/guides/public/",
    });
    const draftGuide = fixturePage({
      pageId: "guide.draft",
      route: "/guides/draft/",
      publicationStatus: "draft",
    });
    const privateGuide = fixturePage({
      pageId: "guide.private",
      route: "/guides/private/",
      visibility: "private",
    });
    const disabledUpdate = fixturePage({
      pageId: "patch.disabled",
      route: "/news/disabled/",
      pageType: "patch",
      module: "news",
      feature: "news",
    });
    const config = defineGameConfig({
      ...siteConfig,
      features: {
        ...siteConfig.features,
        guides: true,
        news: false,
      },
    });
    const enabledPages = buildEnabledPageCatalog(config, [
      publicGuide,
      draftGuide,
      privateGuide,
      disabledUpdate,
    ]);

    const model = buildHomepageModel({ enabledPages, featuredPages: [] });

    expect(surfacedPageIds(model)).toEqual(["guide.public"]);
    expect(model.latestUpdates).toEqual([]);
  });

  it("de-duplicates sections deterministically without changing the enabled catalog", () => {
    const start = fixturePage({ pageId: "guide.start", route: "/guides/start/", priority: 90 });
    const featured = fixturePage({ pageId: "guide.featured", route: "/guides/featured/", priority: 80 });
    const category = fixturePage({ pageId: "hub.guides", route: "/guides/", pageType: "hub", priority: 95 });
    const system = fixturePage({ pageId: "database.guides", route: "/guides/database/", pageType: "database", priority: 70 });
    const update = fixturePage({ pageId: "patch.current", route: "/news/current/", pageType: "patch", module: "news", feature: "news", updatedAt: "2026-09-03" });
    const other = fixturePage({ pageId: "guide.other", route: "/guides/other/", priority: 40 });
    const enabledPages = [other, update, system, featured, category, start];
    const featuredPages = [start, featured];

    const first = buildHomepageModel({ enabledPages, featuredPages });
    const second = buildHomepageModel({
      enabledPages: [...enabledPages].reverse(),
      featuredPages,
    });

    expect(surfacedPageIds(first)).toEqual(surfacedPageIds(second));
    expect(new Set(surfacedPageIds(first)).size).toBe(surfacedPageIds(first).length);
    expect(pageIds(enabledPages)).toHaveLength(6);
  });

  it("keeps an empty or minimal dataset coherent", () => {
    const empty = buildHomepageModel({ enabledPages: [], featuredPages: [] });
    const minimal = buildHomepageModel({
      enabledPages: [homePage],
      featuredPages: [],
    });

    for (const model of [empty, minimal]) {
      expect(model.heroStartPage).toBeUndefined();
      expect(surfacedPageIds(model)).toEqual([]);
      expect(model.quickFacts).toEqual([]);
      expect(model.faq).toEqual([]);
      expect(model.media.galleryMedia).toEqual([]);
    }
  });

  it("accepts an authored homepage display heading and rejects blank values", () => {
    const custom = defineGameConfig({
      ...siteConfig,
      homepage: {
        ...siteConfig.homepage,
        displayHeading: "Field Manual",
      },
    });

    expect(custom.homepage.displayHeading).toBe("Field Manual");
    expect(() =>
      defineGameConfig({
        ...siteConfig,
        homepage: {
          ...siteConfig.homepage,
          displayHeading: " \n\t ",
        },
      }),
    ).toThrow(/displayHeading/i);
  });

  it("keeps every eligible page discoverable in a 20+ page fixture", () => {
    const pages = Array.from({ length: 24 }, (_, index) =>
      fixturePage({
        pageId: `guide.fixture-${index + 1}`,
        route: `/guides/fixture-${index + 1}/`,
        priority: 100 - index,
      }),
    );
    const model = buildHomepageModel({
      enabledPages: [homePage, ...pages],
      featuredPages: pages.slice(0, 3),
    });

    expect(new Set(surfacedPageIds(model))).toEqual(
      new Set(pages.map((page) => page.pageId)),
    );
    expect(surfacedPageIds(model)).toHaveLength(24);
  });

  it("passes through optional authored facts, FAQ and Phase B media without storing them", () => {
    const quickFacts = [{ label: "Developer", value: "Example Studio" }];
    const faq = [{ question: "Where should I begin?", answer: "Open the first guide." }];
    const heroMedia = {
      id: "home.hero",
      dimensions: { width: 800, height: 600 },
      rightsRef: "private/qa-home-hero",
      type: "image" as const,
      src: "/media/home-hero.svg",
      alt: "A player crossing the opening area",
      sourceUrl: "https://example.com/home-hero",
    };

    const model = buildHomepageModel({
      enabledPages: [homePage],
      featuredPages: [],
      quickFacts,
      faq,
      media: { heroMedia, galleryMedia: [] },
    });

    expect(model.quickFacts).toEqual(quickFacts);
    expect(model.faq).toEqual(faq);
    expect(model.media.heroMedia).toBe(heroMedia);
  });
});

describe("homepage presentation", () => {
  it("renders a player-facing Game Hero with resolved start and optional Phase B hero media", async () => {
    const startPage = fixturePage({
      pageId: "guide.start",
      route: "/guides/start/",
    });
    const heroMedia = {
      id: "home.hero",
      dimensions: { width: 800, height: 600 },
      rightsRef: "private/qa-home-hero",
      type: "image" as const,
      src: "/media/home-hero.svg",
      alt: "A player crossing the opening area",
      sourceUrl: "https://example.com/home-hero",
    };
    const html = await renderComponent(
      homeComponents,
      "../src/components/home/GameHero.astro",
      {
        page: homePage,
        brand: siteConfig.brand,
        startPage,
        heroMedia,
      },
    );

    expect(html).toContain(siteConfig.brand.name);
    expect(html).toContain(homePage.description);
    expect(html).toContain(`href="${startPage.route}"`);
    expect(html).toMatch(/Start here/i);
    expect(html).toContain(`src="${heroMedia.src}"`);
    expect(html).toContain("game-hero--has-media");
    expect(html).not.toMatch(/Published nodes|Active systems|Source policy|Operating doctrine/i);
  });

  it("uses authored heading when provided and brand.name fallback otherwise", async () => {
    const custom = await renderComponent(
      homeComponents,
      "../src/components/home/GameHero.astro",
      {
        page: homePage,
        brand: siteConfig.brand,
        displayHeading: "Field Manual",
      },
    );
    const fallback = await renderComponent(
      homeComponents,
      "../src/components/home/GameHero.astro",
      {
        page: homePage,
        brand: siteConfig.brand,
      },
    );

    expect(custom).toMatch(/<h1[^>]*>\s*Field Manual\s*<\/h1>/);
    expect(fallback).toMatch(new RegExp(`<h1[^>]*>\\s*${siteConfig.brand.name}\\s*</h1>`));
    expect(custom).not.toMatch(/Find your route|Play with a plan/i);
    expect(fallback).not.toMatch(/Find your route|Play with a plan/i);
  });

  it("omits empty actions, dead category anchors and media wrappers for a minimal homepage", async () => {
    const html = await renderComponent(
      homeComponents,
      "../src/components/home/GameHero.astro",
      {
        page: homePage,
        brand: siteConfig.brand,
      },
    );

    expect(html).not.toContain("hero__actions");
    expect(html).not.toContain('href="#browse-by-category"');
    expect(html).toContain("game-hero--no-media");
    expect(html).not.toContain("game-hero__media");
  });

  it("renders category and page collections only when real pages exist", async () => {
    const guideRoot = fixturePage({
      pageId: "hub.guides",
      route: "/guides/",
      pageType: "hub",
    });
    const emptyCategories = await renderComponent(
      homeComponents,
      "../src/components/home/WikiCategories.astro",
      { pages: [] },
    );
    const categories = await renderComponent(
      homeComponents,
      "../src/components/home/WikiCategories.astro",
      { pages: [guideRoot] },
    );
    const emptyCollection = await renderComponent(
      homeComponents,
      "../src/components/home/PageCollection.astro",
      { id: "featured-guides", title: "Featured guides", pages: [] },
    );
    const collection = await renderComponent(
      homeComponents,
      "../src/components/home/PageCollection.astro",
      { id: "featured-guides", title: "Featured guides", pages: [guideRoot] },
    );

    expect(emptyCategories.trim()).toBe("");
    expect(emptyCollection.trim()).toBe("");
    expect(categories).toContain(guideRoot.title);
    expect(categories).toContain(`href="${guideRoot.route}"`);
    expect(collection).toContain("Featured guides");
    expect(collection).toContain(guideRoot.description);
    expect(collection).not.toMatch(/Priority|Confidence|Search Signal|primaryKeyword|contentStatus|developmentStatus/);
  });

  it("uses a fixed portal composition without a homepage section DSL", () => {
    const index = source(indexUrl);
    const orderedMarkers = [
      "<GameHero",
      "<QuickFacts",
      'id="start-here"',
      "<WikiCategories",
      'title="Featured guides"',
      'title="Important systems"',
      'title="Latest updates"',
      'id="home-media"',
      "<FAQ",
      'title="Browse all"',
    ];
    let lastIndex = -1;
    for (const marker of orderedMarkers) {
      const nextIndex = index.indexOf(marker);
      expect(nextIndex, `${marker} is present in fixed order`).toBeGreaterThan(lastIndex);
      lastIndex = nextIndex;
    }

    expect(index).toContain("buildHomepageModel");
    expect(index).toContain("featuredHomepagePages");
    expect(index).toContain("enabledPageCatalog");
    expect(index).toContain("mediaCatalog.getPageMedia(page.pageId)");
    expect(index).not.toMatch(/homepage\.sections|sectionRegistry|blockRegistry|pageBuilder/i);
    expect(index).not.toMatch(/Popular Systems/i);
  });

  it("labels Start Here from the resolved featured page instead of a fixed guide name", () => {
    const index = source(indexUrl);

    expect(index).toContain("{homepage.startHere[0].title}");
    expect(index).not.toContain("Open the getting-started guide");
  });

  it("removes Starter/demo dashboard language from the homepage main content", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(HomePage);
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";

    expect(main).not.toMatch(
      /Published nodes|Active systems|Source policy|Operating doctrine|Configure the starter|Ready for a real game|Routes declared first|Static delivery/i,
    );
    expect(main).not.toMatch(
      /Priority|Confidence|Search Signal|primaryKeyword|contentStatus|developmentStatus|Editorial Brief|Evidence Ledger/i,
    );
    expect(html).not.toMatch(
      /Built for evidence-led game publishing|Static by default|End of transmission|Return to coordinates/i,
    );
    const model = buildHomepageModel({
      enabledPages: enabledPageCatalog,
      featuredPages: featuredHomepagePages,
    });
    expect(main.includes("Start here")).toBe(model.startHere.length > 0);
    expect(main.includes("Browse by category")).toBe(
      model.categories.length > 0,
    );
  });

  it("uses only the existing Phase B media placements and hides an empty home mapping", async () => {
    const container = await AstroContainer.create();
    const emptyMedia = createMediaCatalog({ assets: [], pages: [] }, [homePage.pageId]);
    const mediaQuery = vi.spyOn(mediaCatalog, "getPageMedia")
      .mockImplementation(emptyMedia.getPageMedia);
    let html: string;
    try {
      html = await container.renderToString(HomePage);
    } finally {
      mediaQuery.mockRestore();
    }
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";
    const index = source(indexUrl);

    expect(index).toContain('data-media-placement="gallery"');
    expect(index).toContain('data-media-placement="trailer"');
    expect(index).not.toMatch(/homepageMedia|remoteImage|mediaSlot|placementName/);
    expect(main).not.toContain('id="home-media"');
    expect(main).not.toMatch(/data-media-placement|<img\b|<iframe\b/);
  });

  it("keeps the default Starter config on the brand fallback path", () => {
    const config = source(gameConfigUrl);

    expect(config).not.toMatch(/displayHeading\s*:/);
  });

  it("keeps FAQ optional in content and outside Page Inventory", () => {
    const contentConfig = source(contentConfigUrl);
    const pageInventorySchema = source(
      new URL("../src/data/schemas/page-inventory.ts", import.meta.url),
    );

    expect(contentConfig).toMatch(/faq:\s*z\.array\([\s\S]*?\)\.optional\(\)/);
    expect(contentConfig).toContain("question:");
    expect(contentConfig).toContain("answer:");
    expect(pageInventorySchema).not.toMatch(/\bfaq\s*:/);
  });

  it("defines responsive portal grids, media flow and readable FAQ controls", () => {
    const styles = source(globalStylesUrl);

    expect(styles).toMatch(
      /\.game-hero\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/,
    );
    expect(styles).toMatch(
      /\.game-hero--has-media\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.08fr\)\s+minmax\(320px,\s*0\.92fr\);/,
    );
    expect(styles).toMatch(
      /\.game-hero--no-media\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*860px\);[^}]*justify-content:\s*start;/,
    );
    expect(styles).toMatch(
      /\.portal-grid\s*\{[^}]*display:\s*grid;[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,/,
    );
    expect(styles).toMatch(
      /\.portal-card\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/,
    );
    expect(styles).toMatch(
      /\.home-media__content\s*\{[^}]*display:\s*grid;/,
    );
    expect(styles).toMatch(
      /\.faq__list summary\s*\{[^}]*min-height:\s*48px;/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*?\.game-hero(?:--has-media|--no-media)?\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*620px\)[\s\S]*?\.portal-grid\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
  });
});

describe("FAQ presentation", () => {
  it("renders only authored visible questions and answers", async () => {
    const html = await renderComponent(
      wikiComponents,
      "../src/components/wiki/FAQ.astro",
      {
        items: [
          {
            question: "Where should I begin?",
            answer: "Open the recommended guide and follow its first checklist.",
          },
        ],
      },
    );

    expect(html).toContain("Where should I begin?");
    expect(html).toContain("Open the recommended guide");
    expect(html).toMatch(/<details\b/);
    expect(html).not.toMatch(/FAQPage|application\/ld\+json/);
  });

  it("renders nothing for an empty FAQ", async () => {
    const html = await renderComponent(
      wikiComponents,
      "../src/components/wiki/FAQ.astro",
      { items: [] },
    );

    expect(html.trim()).toBe("");
  });
});


it("states the recorded date provenance of the Latest updates section", () => {
  const source = readFileSync(indexUrl, "utf8");
  expect(source).toContain('title="Latest updates"');
  expect(source).toContain('eyebrow="Ordered by recorded update date"');
});
