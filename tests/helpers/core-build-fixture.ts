import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { GameConfig } from "../../src/config/schema";
import { defineGameConfig } from "../../src/config/schema";
import { parsePageInventory } from "../../src/data/schemas/page-inventory";

const copiedEntries = [
  "src",
  "public",
  "scripts",
  "game.config.ts",
  "astro.config.ts",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
] as const;

export function createCoreBuildFixture(prefix = "starter-core-safety-"): string {
  const fixtureRoot = createProjectCopy(copiedEntries, prefix);
  adoptCoreBuildFixture(fixtureRoot);
  return fixtureRoot;
}

export function createFullProjectFixture(adopted: boolean): string {
  const fixtureRoot = createProjectCopy([
    ...copiedEntries, "tests", "docs", ".github", ".nvmrc", "README.md",
    "vitest.config.ts", "wrangler.jsonc",
  ], "starter-adoption-verification-");
  if (adopted) adoptCoreBuildFixture(fixtureRoot);
  return fixtureRoot;
}

function createProjectCopy(entries: readonly string[], prefix: string): string {
  const projectRoot = process.cwd();
  const fixtureRoot = mkdtempSync(join(tmpdir(), prefix));
  try {
    for (const entry of entries) {
      cpSync(resolve(projectRoot, entry), join(fixtureRoot, entry), { recursive: true });
    }
    symlinkSync(resolve(projectRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");
    const astroConfigPath = join(fixtureRoot, "astro.config.ts");
    writeFileSync(
      astroConfigPath,
      readFileSync(astroConfigPath, "utf8").replace(
        'output: "static",',
        'cacheDir: "./.astro-cache",\n  output: "static",',
      ),
    );
    const isolatedConfig = readFileSync(astroConfigPath, "utf8").replace('vite: {', 'vite: {\n    cacheDir: "./.vite-cache",');
    writeFileSync(astroConfigPath, isolatedConfig);
    if (entries.includes("vitest.config.ts")) {
      const vitestPath = join(fixtureRoot, "vitest.config.ts");
      writeFileSync(vitestPath, readFileSync(vitestPath, "utf8").replace(
        "oxc:", 'cacheDir: "./.vitest-cache",\n    oxc:',
      ));
    }
    return fixtureRoot;
  } catch (error) {
    cleanupCoreBuildFixture(fixtureRoot);
    throw error;
  }
}

function adoptCoreBuildFixture(fixtureRoot: string): void {
  try {
    // Own the synthetic project inputs; copied game inputs are not QA defaults.
    writeFixtureGameConfig(fixtureRoot, defineGameConfig({
      brand: { name: "Field Notes", shortName: "Field", mark: "FN", logoPath: "/logo.svg", tagline: "Synthetic editorial QA project." },
      site: { url: "https://field-notes.example", locale: "en", timezone: "UTC" },
      seo: { defaultTitle: "Field Notes — Guides and Reference", titleTemplate: "%s | Field Notes", defaultDescription: "Synthetic source-aware editorial pages for reusable Core regression checks, not a real game's approval." },
      social: { xHandle: "@fieldnotes" },
      navigation: { groups: [
        { label: "Home", pageId: "home" },
        { label: "Guides", pageId: "hub.guides", children: ["guide.getting-started"] },
        { label: "Search", pageId: "search" },
      ] },
      homepage: { featuredPageIds: ["guide.getting-started"] },
      features: { guides: true, heroes: false, weapons: false, items: false, maps: false, tierLists: false, news: false, search: true, calculator: false, planner: false },
    }));
    // Reuse only our identical asset when an adopted QA project creates nested fixtures.
    const mediaPath = join(fixtureRoot, "src/data/media/media.json");
    const manifest = JSON.parse(readFileSync(mediaPath, "utf8"));
    const asset = { id: "qa.default-share", type: "image", src: "/media/qa-default-share.svg", alt: "Synthetic blue share illustration for technical QA", dimensions: { width: 1200, height: 630 }, rightsRef: "private/qa-default-share", sourceUrl: "https://example.com/qa-default-share" };
    const sharePath = join(fixtureRoot, "public/media/qa-default-share.svg");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#255588"/></svg>';
    const existing = manifest.assets.find((entry: { id: string }) => entry.id === asset.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(asset) || !existsSync(sharePath) || readFileSync(sharePath, "utf8") !== svg) throw new Error("Synthetic share asset ID/content conflict.");
    } else {
      if (existsSync(sharePath)) throw new Error("Unregistered synthetic share path conflict.");
      mkdirSync(join(fixtureRoot, "public/media"), { recursive: true });
      writeFileSync(sharePath, svg);
    }
    rmSync(join(fixtureRoot, "public/media"), { recursive: true, force: true });
    mkdirSync(join(fixtureRoot, "public/media"), { recursive: true });
    writeFileSync(sharePath, svg);
    writeFileSync(mediaPath, JSON.stringify({ assets: [asset], pages: [], defaultShare: asset.id }));
    adoptFixtureInventory(fixtureRoot);
    for (const collection of ["guides", "news", "tierLists", "meta"]) {
      const directory = join(fixtureRoot, "src/content", collection);
      rmSync(directory, { recursive: true, force: true });
      mkdirSync(directory, { recursive: true });
    }
    for (const decisionPath of ["docs/MEDIA_DECISION_TABLE.md", "MEDIA_DECISION_TABLE.md"]) {
      rmSync(join(fixtureRoot, decisionPath), { force: true });
    }
    writeFileSync(join(fixtureRoot, "src/content/guides/getting-started.mdx"), "---\npageId: guide.getting-started\n---\n\nChoose a route and compare the available options before your next session.\n\n## First route\n\nReview the tested choices and use the source notes to check what changed.\n");
    const logoPath = join(fixtureRoot, "public/logo.svg");
    writeFileSync(logoPath, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40" role="img" aria-label="Field Notes logo"><rect width="120" height="40" fill="#255588"/><text x="12" y="27" fill="white">FN</text></svg>');
  } catch (error) {
    cleanupCoreBuildFixture(fixtureRoot);
    throw error;
  }
}

export function writeFixtureGameConfig(fixtureRoot: string, config: GameConfig): void {
  writeFileSync(
    join(fixtureRoot, "game.config.ts"),
    `import { defineGameConfig } from "./src/config/schema";\n\nexport default defineGameConfig(${JSON.stringify(adoptFixtureConfig(config), null, 2)});\n`,
  );
}

export function writeFixtureGameConfigSource(fixtureRoot: string, configSource: string): void {
  writeFileSync(
    join(fixtureRoot, "game.config.ts"),
    `import { defineGameConfig } from "./src/config/schema";\n\nexport default defineGameConfig(${configSource});\n`,
  );
}

export function runFixtureNpm(
  fixtureRoot: string,
  script: "build" | "build:evidence" | "validate",
): SpawnSyncReturns<string> {
  return spawnSync("npm", ["run", script], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 60_000,
  });
}

export function cleanupCoreBuildFixture(fixtureRoot: string): void {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

// Synthetic editorial identity for build tests; never evidence of a real game's approval.
export function adoptFixtureConfig(config: GameConfig): GameConfig {
  return { ...config,
    brand: { ...config.brand, name: "Field Notes", shortName: "Field", mark: "FN" },
    site: { ...config.site, url: "https://field-notes.example" },
    seo: { ...config.seo, defaultTitle: "Field Notes — Guides and Reference", titleTemplate: "%s | Field Notes" },
    social: { ...config.social, xHandle: "@fieldnotes" },
  };
}

export function adoptFixtureInventory(fixtureRoot: string): void {
  const path = join(fixtureRoot, "src/data/page-inventory.json");
  const base = {
    pageId: "home", route: "/", pageType: "home", cluster: "core", module: "core", priority: 50,
    visibility: "public", publicationStatus: "published", contentStatus: "ready", developmentStatus: "ready",
    needsReview: false, needsUpdate: false, indexability: "index",
    title: "Field Notes — Guides and Reference",
    description: "Synthetic source-aware editorial pages for reusable Core regression checks, not a real game's approval.",
    publishedAt: "2026-09-01", updatedAt: "2026-09-01", primaryKeyword: "synthetic field notes home",
    tags: ["synthetic", "testing"], relatedPageIds: ["home"], relatedEntityRefs: [], confidence: "high",
    sources: [{ sourceUrl: "https://field-notes.example/", sourceType: "editorial", accessedAt: "2026-09-01", evidenceNote: "Synthetic QA project provenance only." }],
  };
  const inventory = parsePageInventory([
    { ...base, priority: 100, relatedPageIds: ["guide.getting-started"] },
    { ...base, pageId: "hub.guides", description: "Browse the synthetic Field Notes guide collection to select a QA article and follow its recorded source context.", route: "/guides/", pageType: "hub", module: "guides", feature: "guides", title: "Field Notes Guide Collection", primaryKeyword: "synthetic field notes hub", relatedPageIds: ["guide.getting-started"] },
    { ...base, pageId: "guide.getting-started", description: "Choose a route and review the synthetic Field Notes article before checking the reusable editorial Core output.", route: "/guides/getting-started/", pageType: "guide", module: "guides", feature: "guides", title: "Getting Started with Field Notes", primaryKeyword: "synthetic field notes guide", contentRef: { collection: "guides", slug: "getting-started" } },
    { ...base, pageId: "search", description: "Search the published synthetic Field Notes index while testing local discovery and feature boundaries.", route: "/search/", pageType: "search", module: "search", feature: "search", title: "Search Field Notes Guides", primaryKeyword: "synthetic field notes search", indexability: "noindex" },
    { ...base, pageId: "about", description: "Read the synthetic Field Notes editorial method and source responsibilities without implying real operator approval.", route: "/about/", pageType: "about", title: "About Field Notes Editorial", primaryKeyword: "synthetic field notes about", needsReview: true },
    { ...base, pageId: "privacy", description: "Private synthetic privacy placeholder for testing approved legal activation and unavailable policy routes.", route: "/privacy/", pageType: "privacy", title: "Privacy Policy | Field Notes", primaryKeyword: "synthetic field notes privacy", visibility: "private", publicationStatus: "draft", contentStatus: "draft", indexability: "noindex", legalActivation: { state: "unavailable" } },
    { ...base, pageId: "terms", description: "Private synthetic terms placeholder for testing legal payload approval, indexing and eligible route output.", route: "/terms/", pageType: "terms", title: "Terms of Use | Field Notes", primaryKeyword: "synthetic field notes terms", visibility: "private", publicationStatus: "draft", contentStatus: "draft", indexability: "noindex", legalActivation: { state: "unavailable" } },
    { ...base, pageId: "not-found", description: "Recover from an unknown synthetic Field Notes route by returning to its published editorial navigation.", route: "/404.html", pageType: "not-found", title: "Page Not Found | Field Notes", primaryKeyword: "synthetic field notes not found", indexability: "noindex" },
    { ...base, pageId: "hero.demo-sentinel", description: "Disabled synthetic hero record for verifying entity feature gating without exposing a production game claim.", route: "/heroes/demo-sentinel/", pageType: "hero", module: "heroes", feature: "heroes", title: "Synthetic Demo Sentinel Hero", primaryKeyword: "synthetic field notes hero", entityRef: { entityType: "hero", entityId: "demo-sentinel" } },
  ]);
  writeFileSync(path, JSON.stringify(inventory, null, 2));
}
