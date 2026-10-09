import { describe, expect, it } from "vitest";

import {
  defineGameConfig,
  gameConfigSchema,
  featureFlagKeys,
  type GameConfigInput,
} from "../src/config/schema";
import {
  pageModuleSchema,
  pageTypeSchema,
} from "../src/data/schemas/page-inventory";

const validConfig: GameConfigInput = {
  brand: {
    name: "Game Atlas",
    shortName: "Atlas",
    mark: "GA",
    tagline: "Clear answers for every session.",
  },
  site: {
    url: "https://gameatlas.example",
    locale: "en",
    timezone: "UTC",
  },
  seo: {
    defaultTitle: "Game Atlas — Guides, Builds & Game Data",
    titleTemplate: "%s | Game Atlas",
    defaultDescription:
      "A fast, source-aware starter for guides, builds, and game reference data.",
  },
  social: {
    xHandle: "@gameatlas",
  },
  navigation: {
    primaryPageIds: ["home", "hub.guides", "search"],
  },
  homepage: {
    featuredPageIds: ["guide.getting-started"],
  },
  features: {
    guides: true,
    heroes: false,
    weapons: false,
    items: false,
    maps: false,
    tierLists: false,
    news: false,
    search: true,
    calculator: false,
    planner: false,
  },
};

describe("defineGameConfig", () => {
  it("does not expose unimplemented builds or codes capabilities", () => {
    expect(featureFlagKeys).not.toContain("builds");
    expect(featureFlagKeys).not.toContain("codes");
    expect(pageModuleSchema.safeParse("builds").success).toBe(false);
    expect(pageModuleSchema.safeParse("codes").success).toBe(false);
    expect(pageTypeSchema.safeParse("build").success).toBe(false);
    expect(pageTypeSchema.safeParse("codes").success).toBe(false);
    expect(pageTypeSchema.safeParse("tier-list").success).toBe(false);
    expect(pageTypeSchema.safeParse("news").success).toBe(false);
  });

  it("accepts an English-first config with every feature flag explicit", () => {
    const config = defineGameConfig(validConfig);

    expect(config.site.locale).toBe("en");
    expect(Object.keys(config.features).sort()).toEqual(
      [...featureFlagKeys].sort(),
    );
    expect(config.navigation.groups).toEqual([
      { pageId: "home", children: [] },
      { pageId: "hub.guides", children: [] },
      { pageId: "search", children: [] },
    ]);
    expect(config.homepage.featuredPageIds).toEqual([
      "guide.getting-started",
    ]);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("accepts grouped navigation and normalizes empty children", () => {
    const config = defineGameConfig({
      ...validConfig,
      navigation: {
        groups: [
          { pageId: "home" },
          {
            label: "Guides",
            pageId: "hub.guides",
            children: ["guide.getting-started"],
          },
          { pageId: "search", children: [] },
        ],
      },
    });

    expect(config.navigation.groups).toEqual([
      { pageId: "home", children: [] },
      {
        label: "Guides",
        pageId: "hub.guides",
        children: ["guide.getting-started"],
      },
      { pageId: "search", children: [] },
    ]);
  });

  it("rejects duplicate Page IDs within the navigation tree", () => {
    expect(() =>
      defineGameConfig({
        ...validConfig,
        navigation: {
          groups: [
            {
              pageId: "hub.guides",
              children: ["guide.getting-started"],
            },
            { pageId: "guide.getting-started" },
          ],
        },
      }),
    ).toThrow(/navigation.*unique/i);
  });

  it("rejects navigation that authors grouped and legacy forms together", () => {
    expect(() =>
      defineGameConfig({
        ...validConfig,
        navigation: {
          primaryPageIds: ["home"],
          groups: [{ pageId: "home" }],
        },
      }),
    ).toThrow();
  });

  it("does not apply navigation-tree uniqueness outside navigation", () => {
    const config = defineGameConfig({
      ...validConfig,
      navigation: { groups: [{ pageId: "home" }] },
      homepage: { featuredPageIds: ["home"] },
    });

    expect(config.navigation.groups[0]?.pageId).toBe("home");
    expect(config.homepage.featuredPageIds).toEqual(["home"]);
  });

  it("rejects a non-HTTPS production site URL", () => {
    expect(() =>
      defineGameConfig({
        ...validConfig,
        site: { ...validConfig.site, url: "http://gameatlas.example" },
      }),
    ).toThrow(/HTTPS/i);
  });

  it("rejects a non-English locale", () => {
    expect(() =>
      defineGameConfig({
        ...validConfig,
        site: { ...validConfig.site, locale: "zh-CN" },
      }),
    ).toThrow(/English/i);
  });

  it("rejects a config that omits a feature flag", () => {
    const { heroes: _heroes, ...incompleteFeatures } = validConfig.features;

    expect(() =>
      defineGameConfig({
        ...validConfig,
        features: incompleteFeatures,
      } as GameConfigInput),
    ).toThrow();
  });
  it("accepts explicit identity and independent role evidence", () => {
    const config = defineGameConfig({
      ...validConfig,
      identity: {
        organization: {
          kind: "Organization", name: "Atlas Studio", projectConfirmed: true, evidenceRef: "entity:studio",
        },
        sitePublisher: {
          identity: { kind: "Person", name: "Site Publisher", projectConfirmed: true, evidenceRef: "entity:publisher" },
          evidenceRef: "role:site-publisher",
        },
        articles: {
          "guide.getting-started": {
            author: {
              identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
              evidenceRef: "role:article-author",
            },
          },
        },
      },
    });
    expect(config.identity?.organization?.kind).toBe("Organization");
    expect(config.identity?.sitePublisher?.identity.name).toBe("Site Publisher");
    expect(config.identity?.articles?.["guide.getting-started"]?.author?.identity.name).toBe("Guide Author");
  });

  it.each([
    ["false confirmation", { kind: "Person", name: "Author", projectConfirmed: false, evidenceRef: "entity:author" }],
    ["string confirmation", { kind: "Person", name: "Author", projectConfirmed: "true", evidenceRef: "entity:author" }],
    ["blank evidence", { kind: "Person", name: "Author", projectConfirmed: true, evidenceRef: "   " }],
  ])("rejects identity with %s", (_label, identity) => {
    expect(() => defineGameConfig({
      ...validConfig,
      identity: {
        sitePublisher: { identity, evidenceRef: "role:publisher" },
      },
    } as GameConfigInput)).toThrow();
  });

  it("rejects Person in the organization-only slot and unknown identity keys", () => {
    expect(() => defineGameConfig({
      ...validConfig,
      identity: {
        organization: { kind: "Person", name: "Not an org", projectConfirmed: true, evidenceRef: "entity:x" },
      },
    } as unknown as GameConfigInput)).toThrow();
    expect(() => defineGameConfig({
      ...validConfig,
      identity: { unexpected: true },
    } as unknown as GameConfigInput)).toThrow();
  });

});


describe("explicit semantic visual roles", () => {
  const complete = {
    font: "interface", density: "compact", shape: "soft", state: "quiet",
  } as const;

  it("keeps legacy omission distinct from an explicit project choice", () => {
    expect(gameConfigSchema.parse(validConfig)).not.toHaveProperty("visualRoles");
  });

  it("accepts the complete alternate role selection", () => {
    expect(gameConfigSchema.parse({ ...validConfig, visualRoles: complete }).visualRoles).toEqual(complete);
  });

  it("accepts the complete default role selection", () => {
    const roles = { font: "editorial", density: "comfortable", shape: "square", state: "lifted" };
    expect(gameConfigSchema.parse({ ...validConfig, visualRoles: roles }).visualRoles).toEqual(roles);
  });

  it.each(["font", "density", "shape", "state"])("rejects an authored object missing %s", (key) => {
    const roles: Record<string, string> = { ...complete };
    delete roles[key];
    expect(gameConfigSchema.safeParse({ ...validConfig, visualRoles: roles }).success).toBe(false);
  });

  it.each([
    ["font", "Cinzel"], ["font", "fantasy"], ["density", "12px"],
    ["density", "very-dense"], ["shape", "8px"], ["state", "animated"],
  ])("rejects unsupported %s role %s", (key, value) => {
    expect(gameConfigSchema.safeParse({ ...validConfig, visualRoles: { ...complete, [key]: value } }).success).toBe(false);
  });

  it.each(["fontFamily", "borderRadius", "hoverTransform", "style"])("rejects arbitrary override key %s", (key) => {
    expect(gameConfigSchema.safeParse({ ...validConfig, visualRoles: { ...complete, [key]: "none" } }).success).toBe(false);
  });
});
