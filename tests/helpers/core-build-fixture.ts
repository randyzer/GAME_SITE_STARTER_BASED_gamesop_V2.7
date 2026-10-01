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
  return fixtureRoot;
}

export function writeFixtureGameConfig(fixtureRoot: string, config: GameConfig): void {
  writeFileSync(
    join(fixtureRoot, "game.config.ts"),
    `import { defineGameConfig } from "./src/config/schema";\n\nexport default defineGameConfig(${JSON.stringify(config, null, 2)});\n`,
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
