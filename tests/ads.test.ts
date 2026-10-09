import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import AdSlot from "../src/components/ads/AdSlot.astro";
import ProjectAd from "../src/components/ads/ProjectAd.astro";
import {
  adsConfig,
  canonicalAdPlacements,
  defineAdsConfig,
  resolveAdPlacement,
  type AdPlacement,
  type AdPlacementDefinition,
  type AdsConfig,
} from "../src/config/ads";
import { collectAdHtmlAuditErrors } from "../src/core/html-audit";
import HomePage from "../src/pages/index.astro";
import TestAdProvider from "./fixtures/ads/TestAdProvider.astro";

const originalEnabled = adsConfig.enabled;
const originalPlacements = { ...adsConfig.placements };

afterEach(() => {
  adsConfig.enabled = originalEnabled;
  for (const placement of Object.keys(adsConfig.placements)) {
    delete adsConfig.placements[placement as keyof typeof adsConfig.placements];
  }
  Object.assign(adsConfig.placements, originalPlacements);
});

function definition(
  overrides: Partial<AdPlacementDefinition> = {},
): AdPlacementDefinition {
  return {
    enabled: true,
    instanceId: "home-primary-1",
    publicSlotId: "public-home-primary",
    ...overrides,
  };
}

async function renderAdSlot(
  props: Record<string, unknown> = { placement: "home-primary" },
) {
  const container = await AstroContainer.create();
  return container.renderToString(AdSlot, { props });
}

describe("ads configuration", () => {
  it("ships disabled with a small canonical placement vocabulary and no configured placements", () => {
    expect(adsConfig).toEqual({ enabled: false, placements: {} });
    expect(canonicalAdPlacements).toEqual(["home-primary", "before-footer"]);
  });

  it("fails closed for global, local, absent, and explicitly disabled states", () => {
    const enabledConfig = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": definition(),
        "before-footer": definition({
          enabled: false,
          instanceId: "before-footer-1",
          publicSlotId: "public-before-footer",
        }),
      },
    });

    expect(resolveAdPlacement(adsConfig, "home-primary")).toBeNull();
    expect(resolveAdPlacement(enabledConfig, "home-primary", false)).toBeNull();
    expect(resolveAdPlacement(enabledConfig, "before-footer")).toBeNull();
    expect(resolveAdPlacement(enabledConfig, "project-missing" as never)).toBeNull();
    expect(resolveAdPlacement(enabledConfig, "home-primary")).toEqual(definition());
  });

  it("rejects incomplete identities, duplicate instances, and invalid dimensions", () => {
    expect(() =>
      defineAdsConfig({
        enabled: true,
        placements: {
          "home-primary": definition({ publicSlotId: "" }),
        },
      }),
    ).toThrow(/public slot identity/i);

    expect(() =>
      defineAdsConfig({
        enabled: true,
        placements: {
          "home-primary": definition(),
          "before-footer": definition({
            instanceId: "home-primary-1",
            publicSlotId: "public-before-footer",
          }),
        },
      }),
    ).toThrow(/duplicate.*instance/i);

    for (const invalid of [
      definition({ width: 728 }),
      definition({ width: 0, height: 90 }),
      definition({ width: Number.NaN, height: 90 }),
    ]) {
      expect(() =>
        defineAdsConfig({
          enabled: true,
          placements: { "home-primary": invalid },
        }),
      ).toThrow(/dimensions/i);
    }
  });

  it("does not validate provider identity for a placement that is explicitly disabled", () => {
    const config = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: false,
          instanceId: "",
          publicSlotId: "",
          width: -1,
        },
      },
    });

    expect(resolveAdPlacement(config, "home-primary")).toBeNull();
  });

  it("supports a reviewed project-specific semantic placement without opening the type to any string", () => {
    const reviewedProjectPlacements = ["article-after-intro"] as const;
    type ProjectPlacement = (typeof reviewedProjectPlacements)[number];
    type ExtendedPlacement = AdPlacement | ProjectPlacement;
    const config: AdsConfig<ExtendedPlacement> = {
      enabled: true,
      placements: {
        "article-after-intro": definition({
          instanceId: "article-after-intro-1",
          publicSlotId: "public-article-after-intro",
        }),
      },
    };

    expect(resolveAdPlacement(config, reviewedProjectPlacements[0])).toEqual(
      definition({
        instanceId: "article-after-intro-1",
        publicSlotId: "public-article-after-intro",
      }),
    );
    expectTypeOf<"unreviewed-arbitrary-placement">().not.toExtend<ExtendedPlacement>();
  });
});

describe("AdSlot rendering", () => {
  it("renders literally nothing with the shipped disabled configuration", async () => {
    const html = await renderAdSlot();

    expect(html.trim()).toBe("");
    expect(html).not.toMatch(/data-ad-|<script|style=|min-height|aspect-ratio/i);
  });

  it("renders literally nothing when locally disabled or absent", async () => {
    adsConfig.enabled = true;
    adsConfig.placements["home-primary"] = definition();

    expect((await renderAdSlot({ placement: "home-primary", enabled: false })).trim()).toBe("");
    expect((await renderAdSlot({ placement: "before-footer" })).trim()).toBe("");
  });

  it("renders literally nothing for a configured placement that is explicitly disabled", async () => {
    adsConfig.enabled = true;
    adsConfig.placements["home-primary"] = definition({
      enabled: false,
      instanceId: "configured-disabled-instance",
      publicSlotId: "public-configured-disabled",
      width: 728,
      height: 90,
    });

    const html = await renderAdSlot();

    expect(html.trim()).toBe("");
    expect(html).not.toMatch(/data-ad-|<script|style=|min-height|aspect-ratio/i);
  });

  it("renders one accessible semantic wrapper for one enabled placement", async () => {
    adsConfig.enabled = true;
    adsConfig.placements["home-primary"] = definition();

    const html = await renderAdSlot({
      placement: "home-primary",
      label: "Sponsored content",
    });

    expect(html.match(/data-ad-placement="home-primary"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Sponsored content"');
    expect(html).not.toMatch(/data-ad-instance|<script|https?:\/\//i);
  });

  it("reserves responsive space only for positive configured dimensions", async () => {
    adsConfig.enabled = true;
    adsConfig.placements["home-primary"] = definition({ width: 728, height: 90 });
    const known = await renderAdSlot();

    adsConfig.placements["home-primary"] = definition();
    const unknown = await renderAdSlot();

    expect(known).toMatch(/--ad-slot-width:\s*728/);
    expect(known).toMatch(/--ad-slot-height:\s*90/);
    expect(known).toMatch(/aspect-ratio:\s*var\(--ad-slot-width\)\s*\/\s*var\(--ad-slot-height\)/);
    expect(known).not.toMatch(/clamp\(|min-height/i);
    expect(unknown).not.toMatch(/--ad-slot-(?:width|height)|aspect-ratio|min-height/i);
  });

  it("keeps the shipped project provider edge a no-op", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ProjectAd, {
      props: { placement: "home-primary", definition: definition() },
    });

    expect(html.trim()).toBe("");
  });

  it("allows a project-owned provider edge to emit one explicit public instance", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(TestAdProvider, {
      props: { placement: "home-primary", definition: definition() },
    });

    expect(html.match(/data-ad-instance="home-primary-1"/g)).toHaveLength(1);
    expect(html.match(/data-ad-bootstrap="fixture-bootstrap"/g)).toHaveLength(1);
    expect(html).toContain('data-public-slot-id="public-home-primary"');
    expect(html).not.toMatch(
      /secret|api-key|account-token|Human Ads Review|PROVIDER\/ENVIRONMENT|HUMAN_BROWSER/i,
    );
  });

  it("composes one real AdSlot wrapper with one provider root without leaking a synthetic secret", async () => {
    const privateSecretSentinel = "SYNTHETIC_PRIVATE_SECRET_MUST_NOT_LEAK_9F3C";
    adsConfig.enabled = true;
    adsConfig.placements["home-primary"] = definition();
    const wrapper = await renderAdSlot();
    const container = await AstroContainer.create();
    const provider = await container.renderToString(TestAdProvider, {
      props: {
        placement: "home-primary",
        definition: definition(),
        privateSecretSentinel,
      },
    });
    const composed = wrapper.replace("</section>", `${provider}</section>`);
    const enabled = defineAdsConfig({
      enabled: true,
      placements: { "home-primary": definition() },
    });

    expect(composed.match(/data-ad-placement="home-primary"/g)).toHaveLength(1);
    expect(composed.match(/data-ad-instance="home-primary-1"/g)).toHaveLength(1);
    expect(composed).not.toContain(privateSecretSentinel);
    expect(collectAdHtmlAuditErrors(new Map([["/", composed]]), enabled)).toEqual([]);
  });
});

describe("ad composition boundaries", () => {
  it("composes the dormant homepage placement after the Hero and before later sections", () => {
    const source = readFileSync(
      new URL("../src/pages/index.astro", import.meta.url),
      "utf8",
    );
    const hero = source.indexOf("<GameHero");
    const slot = source.indexOf('<AdSlot placement="home-primary"');
    const laterSection = source.indexOf("homepage.quickFacts.length");

    expect(hero).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(hero);
    expect(slot).toBeLessThan(laterSection);
    expect(source).not.toMatch(/provider|publicSlotId|instanceId|https?:\/\//i);
  });

  it("keeps global layout, main config, and runtime inventory free of ad policy", () => {
    const paths = [
      "../src/layouts/BaseLayout.astro",
      "../src/config/schema.ts",
      "../src/config/load-config.ts",
      "../src/data/page-inventory.json",
      "../src/data/schemas/page-inventory.ts",
    ];

    for (const path of paths) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/AdSlot|ProjectAd|data-ad-|before-footer/i);
    }
  });

  it("keeps the default homepage free of ad DOM, scripts, and reserved space", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(HomePage);

    expect(html).not.toMatch(/data-ad-|ad-slot|public-home-primary|fixture-bootstrap/i);
  });

  it("separates V2.7 Candidate identity from historical release provenance", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const qa = readFileSync(new URL("../docs/QA_CHECKLIST.md", import.meta.url), "utf8");

    expect(readme).toMatch(/^# GAME_SITE_STARTER V2\.7 Candidate$/m);
    expect(qa).toMatch(/^# GAME_SITE_STARTER V2\.7 Candidate QA Checklist$/m);
    expect(readme).toContain("not a released or production-approved package");
    expect(qa).toContain("Candidate is not release identity");
    expect(readme).toMatch(/Inherited V2\.6\.5 documentation-correction patch line/i);
    expect(qa).toMatch(/V2\.6\.5 defines the lifecycle-state corrective patch line/i);
    expect(readme).toMatch(/GAME_SOP v2\.6\.5.*defines.*methodology/i);
    expect(`${readme}\n${qa}`).toMatch(/v2\.6\.4.*released.*frozen/i);
    expect(readme).toContain("starter-v2.6.4");
    expect(qa).toContain("3138778fa4b4cc0f9daa4687a752de99fd1e6d88");

    const historicalReadme = readme.slice(
      readme.indexOf("## Inherited V2.6.5"),
      readme.indexOf("## V2.7 WS-02"),
    );
    const historicalQA = qa.slice(0, qa.indexOf("## V2.7 evidence levels"));
    expect(`${historicalReadme}\n${historicalQA}`).not.toMatch(
      /implementation candidate|under preparation|preparing release|unreleased|not released|release pending|not tagged|untagged|tag pending|not frozen|freeze pending|awaiting freeze/i,
    );
    expect(`${readme}\n${qa}`).not.toMatch(
      /\bV2\.7 (?:is |has been )?(?:released|tagged|frozen|approved)\b|\b(?:released|tagged|frozen|approved) V2\.7\b|starter-v2\.7|final Human PASS|IMPLEMENTATION COMPLETE/i,
    );
  });
});
