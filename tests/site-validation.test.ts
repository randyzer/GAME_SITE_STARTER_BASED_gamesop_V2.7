import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import { entityModuleDefinitions } from "../src/data/entity-modules";
import { pageTypeSchema } from "../src/data/schemas/page-inventory";
import { loadFactModule } from "../src/core/fact-loader";
import {
  pageInventory,
  siteConfig,
} from "../src/core/site-data";
import { collectSiteValidationErrors } from "../src/core/site-validation";

const guideContent = {
  collection: "guides",
  id: "getting-started",
  data: { pageId: "guide.getting-started" },
};

describe("collectSiteValidationErrors", () => {
  it.each(["privacy", "terms"])("rejects explicit navigation and homepage references to unavailable %s", (pageId) => {
    const config = defineGameConfig({
      ...siteConfig,
      features: { ...siteConfig.features, guides: false, search: false },
      navigation: { groups: [{ pageId }] },
      homepage: { featuredPageIds: [pageId] },
    });
    const errors = collectSiteValidationErrors({
      config, inventory: pageInventory, contentEntries: [], factModules: {},
      fixedRoutes: ["/", "/about/", "/404.html"], implementedPageTypes: [...pageTypeSchema.options],
    });
    expect(errors.join("\n")).toMatch(new RegExp(`Navigation.*${pageId}.*enabled catalog`, "i"));
    expect(errors.join("\n")).toMatch(new RegExp(`Homepage.*${pageId}.*enabled catalog`, "i"));
  });
  it("delegates navigation resolution to the site-data resolver", () => {
    const source = readFileSync(
      new URL("../src/core/site-validation.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(/import\s*\{[^}]*resolveNavigationGroups[^}]*\}\s*from\s*["']\.\/site-data["']/s);
    expect(source).not.toMatch(
      /for\s*\([^)]*of\s+input\.config\.navigation\.groups/,
    );
  });

  it("aggregates independent route, content, implementation, and fact errors", () => {
    const configWithHeroes = defineGameConfig({
      ...siteConfig,
      features: {
        ...siteConfig.features,
        guides: true,
        heroes: true,
      },
    });
    const inventoryWithoutHome = pageInventory.filter(
      (page) => page.pageId !== "home",
    );

    const errors = collectSiteValidationErrors({
      config: configWithHeroes,
      inventory: inventoryWithoutHome,
      contentEntries: [],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    });

    expect(errors.join("\n")).toMatch(/fixed route.*\//i);
    expect(errors.join("\n")).toMatch(/content entry.*guide\.getting-started/i);
    expect(errors).toContain(
      'No route family is implemented for enabled page type "hero" (hero.demo-sentinel). Supported page types: home, guide, hub, search, about, privacy, terms, not-found.',
    );
    expect(errors.join("\n")).toMatch(/heroes\.json/i);
  });

  it("accepts the starter's enabled pages and content", () => {
    const contentEntries = pageInventory.flatMap((page) =>
      page.contentRef
        ? [
            {
              collection: page.contentRef.collection,
              id: page.contentRef.slug,
              data: { pageId: page.pageId },
            },
          ]
        : [],
    );
    const errors = collectSiteValidationErrors({
      config: siteConfig,
      inventory: pageInventory,
      contentEntries,
      factModules: Object.fromEntries(
        entityModuleDefinitions
          .filter((definition) => siteConfig.features[definition.module])
          .map((definition) => [
            definition.module,
            loadFactModule(definition.module, siteConfig),
          ]),
      ),
      fixedRoutes: ["/"],
      implementedPageTypes: [...pageTypeSchema.options],
    });

    expect(errors).toEqual([]);
  });

  it("reports broken configured, related, and indexability references together", () => {
    const brokenConfig = defineGameConfig({
      ...siteConfig,
      features: { ...siteConfig.features, heroes: false },
      navigation: {
        groups: [
          { pageId: "home" },
          { pageId: "hero.demo-sentinel" },
        ],
      },
      homepage: {
        featuredPageIds: ["guide.missing"],
      },
    });
    const brokenInventory = pageInventory.map((page) => {
      if (page.pageId === "home") {
        return { ...page, relatedPageIds: ["guide.missing"] };
      }
      if (page.pageId === "about") {
        return { ...page, visibility: "private" as const };
      }
      return page;
    });

    const errors = collectSiteValidationErrors({
      config: brokenConfig,
      inventory: brokenInventory,
      contentEntries: [guideContent],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    }).join("\n");

    expect(errors).toMatch(/navigation.*hero\.demo-sentinel/i);
    expect(errors).toMatch(/homepage.*guide\.missing/i);
    expect(errors).toMatch(/related page.*guide\.missing/i);
    expect(errors).toMatch(/indexable.*about/i);
  });

  it.each([
    ["draft", { publicationStatus: "draft" as const }],
    ["scheduled", { publicationStatus: "scheduled" as const }],
    ["archived", { publicationStatus: "archived" as const }],
    ["private", { visibility: "private" as const }],
    ["unlisted", { visibility: "unlisted" as const }],
  ])("rejects a %s page referenced by navigation", (_label, override) => {
    const config = defineGameConfig({
      ...siteConfig,
      navigation: { groups: [{ pageId: "about" }] },
    });
    const inventory = pageInventory.map((page) =>
      page.pageId === "about"
        ? { ...page, ...override, indexability: "noindex" as const }
        : page,
    );

    const errors = collectSiteValidationErrors({
      config,
      inventory,
      contentEntries: [guideContent],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    }).join("\n");

    expect(errors).toMatch(/navigation.*about.*enabled catalog/i);
  });

  it("rejects a feature-disabled page referenced by navigation", () => {
    const config = defineGameConfig({
      ...siteConfig,
      features: { ...siteConfig.features, heroes: false },
      navigation: { groups: [{ pageId: "hero.demo-sentinel" }] },
    });

    const errors = collectSiteValidationErrors({
      config,
      inventory: pageInventory,
      contentEntries: [guideContent],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    }).join("\n");

    expect(errors).toMatch(/navigation.*hero\.demo-sentinel.*enabled catalog/i);
  });

  it("rejects an entity page gated by another module's feature", () => {
    const mismatchedInventory = pageInventory.map((page) =>
      page.pageId === "hero.demo-sentinel"
        ? { ...page, feature: "items" as const }
        : page,
    );

    const errors = collectSiteValidationErrors({
      config: siteConfig,
      inventory: mismatchedInventory,
      contentEntries: [guideContent],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    }).join("\n");

    expect(errors).toMatch(/hero\.demo-sentinel.*feature.*heroes/i);
  });

  it("lists supported modules when an unsupported module reaches validation", () => {
    const unsupportedModuleInventory = pageInventory.map((page) =>
      page.pageId === "home"
        ? { ...page, module: "unsupported" as never }
        : page,
    );

    const errors = collectSiteValidationErrors({
      config: siteConfig,
      inventory: unsupportedModuleInventory,
      contentEntries: [guideContent],
      factModules: {},
      fixedRoutes: ["/"],
      implementedPageTypes: [
        "home",
        "guide",
        "hub",
        "search",
        "about",
        "privacy",
        "terms",
        "not-found",
      ],
    });

    expect(errors).toContain(
      'Page "home" uses unsupported module "unsupported". Supported modules: core, guides, heroes, weapons, items, maps, tierLists, news, search, tools.',
    );
  });
});
