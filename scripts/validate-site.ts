import { existsSync, readFileSync } from "node:fs";
import { collectSourceResidueSignals } from "./core-safety-sentinels";
import { collectCopiedTextResidueSignals } from "./residue-artifacts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import gameConfig from "../game.config";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import { readContentEntriesFromDirectory } from "../src/core/content-files";
import type { ContentEntryReference } from "../src/core/page-resolution";
import { collectSiteValidationErrors } from "../src/core/site-validation";
import {
  collectMediaReadinessSignals,
  findMediaDecisionTable,
  parseMediaDecisionTableMarkdown,
  type MediaReadinessPurpose,
} from "../src/core/media-readiness";
import {
  entityModuleKeys,
  entityTypeKeys,
  type EntityFactModule,
} from "../src/data/entity-modules";
import pageInventoryData from "../src/data/page-inventory.json";
import { legalContent } from "../src/data/legal-content";
import { parsePageInventory } from "../src/data/schemas/page-inventory";
import { createMediaCatalog } from "../src/data/media/catalog";
import mediaManifest from "../src/data/media/media.json";
import {
  collectChromeAssetConfigErrors,
  isLocalMediaFile,
  isPublicImageFile,
} from "./media-validation";

export interface RunSiteValidationInput {
  projectRoot?: string;
  purpose?: MediaReadinessPurpose;
}

export function runSiteValidation({
  projectRoot = process.cwd(),
  purpose = "final",
}: RunSiteValidationInput = {}): number {
const readErrors: string[] = [];
const warnings: string[] = [];
const info: string[] = [];
const inventory = parsePageInventory(pageInventoryData);
const contentEntries: ContentEntryReference[] = [];

try {
  createMediaCatalog(
    mediaManifest,
    inventory.map((page) => page.pageId),
    (src) => isLocalMediaFile(src, resolve(projectRoot, "public")),
  );
} catch (error) {
  readErrors.push(`Media validation failed: ${error instanceof Error ? error.message : String(error)}`);
}

readErrors.push(
  ...collectChromeAssetConfigErrors(gameConfig, (src) =>
    isPublicImageFile(src, resolve(projectRoot, "public")),
  ),
);

const mediaDecisionTableLocation = findMediaDecisionTable(projectRoot);
readErrors.push(...mediaDecisionTableLocation.errors);
if (mediaDecisionTableLocation.path) {
  const mediaDecisionTable = parseMediaDecisionTableMarkdown(
    readFileSync(mediaDecisionTableLocation.path, "utf8"),
  );
  const mediaReadinessSignals = collectMediaReadinessSignals({
    inventory,
    decisions: mediaDecisionTable.decisions,
    purpose,
  });
  readErrors.push(...mediaDecisionTable.errors);
  readErrors.push(...mediaReadinessSignals.errors);
  warnings.push(...mediaReadinessSignals.warnings);
  info.push(...mediaReadinessSignals.info);
}

const contentCollections = [
  {
    collection: "guides",
    directory: "src/content/guides",
    feature: "guides",
  },
  {
    collection: "tierLists",
    directory: "src/content/meta",
    feature: "tierLists",
  },
  {
    collection: "news",
    directory: "src/content/news",
    feature: "news",
  },
] as const;

for (const definition of contentCollections) {
  if (!gameConfig.features[definition.feature]) {
    continue;
  }

  const directory = resolve(projectRoot, definition.directory);
  try {
    contentEntries.push(
      ...readContentEntriesFromDirectory(directory, definition.collection),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    readErrors.push(`Could not read ${definition.collection} content: ${message}`);
  }
}

const factModules: Partial<Record<EntityFactModule, unknown>> = {};
const entityFactModules: EntityFactModule[] = [...entityModuleKeys];

for (const module of entityFactModules) {
  const filePath = resolve(projectRoot, `src/data/facts/${module}.json`);
  if (!existsSync(filePath)) {
    continue;
  }

  try {
    factModules[module] = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    readErrors.push(`Could not parse src/data/facts/${module}.json: ${message}`);
    factModules[module] = null;
  }
}

const validationErrors = collectSiteValidationErrors({
  config: gameConfig,
  inventory,
  contentEntries,
  factModules,
  legalContent,
  fixedRoutes: [
    "/",
    "/about/",
    "/404.html",
  ],
  implementedPageTypes: [
    "home",
    "guide",
    "hub",
    "search",
    "about",
    "privacy",
    "terms",
    "not-found",
    "database",
    ...entityTypeKeys,
    "meta",
    "patch",
    "calculator",
    "planner",
  ],
});
const enabledPages = buildEnabledPageCatalog(gameConfig, inventory, legalContent);
const residueSignals = collectSourceResidueSignals({ config: gameConfig, pages: enabledPages,
  contentEntries, legalContent, purpose });
warnings.push(...residueSignals.warnings);
const copiedText = collectCopiedTextResidueSignals({ publicDirectory: resolve(projectRoot, "public"),
  readDirectory: resolve(projectRoot, "public"), config: gameConfig, mediaAssets: mediaManifest.assets, purpose });
warnings.push(...copiedText.warnings);
const errors = [...readErrors, ...validationErrors, ...residueSignals.errors, ...copiedText.errors];

if (errors.length > 0) {
  console.error("Site validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  for (const item of info) console.info(`Info: ${item}`);
  return 1;
} else {
  console.log(
    `Site validation passed: ${enabledPages.length} enabled pages, ${contentEntries.length} content entries.`,
  );
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  for (const item of info) console.info(`Info: ${item}`);
  return 0;
}
}

function isMainModule(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  if (process.argv.length > 2) {
    console.error("Public site validation is final-only; unsupported CLI arguments were provided.");
    process.exitCode = 1;
  } else {
    process.exitCode = runSiteValidation();
  }
}
