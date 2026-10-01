import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { GameConfig } from "../../src/config/schema";
import gameConfig from "../../game.config";

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
  const projectRoot = process.cwd();
  const fixtureRoot = mkdtempSync(join(tmpdir(), prefix));
  for (const entry of copiedEntries) {
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
  writeFixtureGameConfig(fixtureRoot, adoptFixtureConfig(gameConfig));
  adoptFixtureInventory(fixtureRoot);
  writeFileSync(join(fixtureRoot, "src/content/guides/getting-started.mdx"), "---\npageId: guide.getting-started\n---\n\nChoose a route and compare the available options before your next session.\n\n## First route\n\nReview the tested choices and use the source notes to check what changed.\n");
  const aboutPath = join(fixtureRoot, "src/core/static-page-copy.ts");
  writeFileSync(aboutPath, readFileSync(aboutPath, "utf8").replace("Game Atlas is a reusable editorial system for answering game questions with less noise and clearer evidence.", "Field Notes publishes independent reference articles with documented sources and corrections."));
  const logoPath = join(fixtureRoot, "public/logo.svg");
  writeFileSync(logoPath, readFileSync(logoPath, "utf8").replace("Game Atlas logo", "Field Notes logo"));
  return fixtureRoot;
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
  const inventory = JSON.parse(readFileSync(path, "utf8"));
  for (const page of inventory) {
    page.title = page.pageId === "guide.getting-started" ? "Getting Started with Field Notes" : page.title.replaceAll("Game Atlas", "Field Notes");
    page.description = page.description.replaceAll("Game Atlas", "Field Notes");
    for (const source of page.sources) source.sourceUrl = source.sourceUrl.replace("gameatlas.example", "field-notes.example");
  }
  writeFileSync(path, JSON.stringify(inventory, null, 2));
}
