import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAGEFIND_OPTIONAL_UI_FILES,
  classifyPagefindArtifacts,
  formatPagefindDiagnostics,
  pagefindContractReview,
  type PagefindArtifactFile,
  type PagefindArtifactReport,
} from "../src/core/pagefind-artifacts";

export interface InspectPagefindArtifactsInput {
  pagefindDirectory: string;
  installedVersion: string;
}

export interface NormalizePagefindOutputInput {
  projectRoot: string;
  outputDirectory: string;
  installedVersion: string;
}

export interface PagefindNormalizationResult {
  rawTotalBytes: number;
  removedOptionalUiBytes: number;
  removedOptionalUiFiles: string[];
  report: PagefindArtifactReport;
}

export function readInstalledPagefindVersion(projectRoot: string): string {
  const packagePath = join(projectRoot, "node_modules/pagefind/package.json");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read installed Pagefind package identity at ${packagePath}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const version = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).version
    : undefined;
  if (typeof version !== "string") {
    throw new Error(`Installed Pagefind package identity at ${packagePath} has no valid version.`);
  }
  return version;
}

function discoverPagefindArtifacts(pagefindDirectory: string) {
  const files: PagefindArtifactFile[] = [];
  const directories: string[] = [];
  const discoveryErrors: string[] = [];

  if (!existsSync(pagefindDirectory)) {
    discoveryErrors.push(pagefindContractReview("Required Pagefind output directory is missing."));
    return { files, directories, discoveryErrors, manifestSource: undefined };
  }

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const artifactPath = relative(pagefindDirectory, path).split(sep).join("/");
      if (entry.isDirectory()) {
        directories.push(artifactPath);
        walk(path);
      } else if (entry.isFile()) {
        files.push({
          path: artifactPath,
          bytes: statSync(path).size,
          content: artifactPath.endsWith(".pf_meta") ? readFileSync(path) : undefined,
        });
      } else {
        discoveryErrors.push(
          pagefindContractReview(`Unknown or unsupported Pagefind filesystem entry: ${artifactPath}.`),
        );
      }
    }
  };
  walk(pagefindDirectory);

  const entryPath = join(pagefindDirectory, "pagefind-entry.json");
  let manifestSource: string | undefined;
  if (existsSync(entryPath)) {
    try {
      manifestSource = readFileSync(entryPath, "utf8");
    } catch (error) {
      discoveryErrors.push(pagefindContractReview(
        `Required Pagefind entry manifest could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      ));
    }
  }
  return { files, directories, discoveryErrors, manifestSource };
}

export function inspectPagefindArtifacts({
  pagefindDirectory,
  installedVersion,
}: InspectPagefindArtifactsInput): PagefindArtifactReport {
  return classifyPagefindArtifacts({
    installedVersion,
    ...discoverPagefindArtifacts(pagefindDirectory),
  });
}

function collectReferenceFiles(directory: string, excludedDirectory?: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const excluded = excludedDirectory ? resolve(excludedDirectory) : undefined;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (excluded && resolve(path) === excluded) continue;
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new Error(`Reference safety cannot be proven because ${path} is not a regular file or directory.`);
      }
    }
  };
  walk(directory);
  return files;
}

function proveOptionalUiUnreferenced(
  projectRoot: string,
  outputDirectory: string,
  optionalUiFiles: string[],
): void {
  if (optionalUiFiles.length === 0) return;
  const searchRuntimePaths = [
    join(projectRoot, "src/components/islands/SearchIsland.tsx"),
    join(projectRoot, "src/core/pagefind-search-adapter.ts"),
  ];
  for (const path of searchRuntimePaths) {
    if (!existsSync(path) || !lstatSync(path).isFile()) {
      throw new Error(
        `Pagefind optional UI reference safety cannot be proven because the current Starter search runtime is missing: ${path}.`,
      );
    }
  }
  const pagefindDirectory = join(outputDirectory, "pagefind");
  const referenceFiles = [
    ...collectReferenceFiles(outputDirectory, pagefindDirectory),
    ...searchRuntimePaths,
  ];
  for (const path of referenceFiles) {
    let content: Buffer;
    try {
      content = readFileSync(path);
    } catch (error) {
      throw new Error(
        `Pagefind optional UI reference safety cannot be proven because ${path} could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
    for (const optionalUi of optionalUiFiles) {
      if (content.includes(Buffer.from(optionalUi))) {
        throw new Error(
          `Pagefind optional UI artifact ${optionalUi} is referenced by ${relative(projectRoot, path)}; reference safety failed and no optional UI was removed.`,
        );
      }
    }
  }
}

function throwContractErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Pagefind artifact contract failed:\n- ${errors.join("\n- ")}`);
  }
}

export function normalizePagefindOutput({
  projectRoot,
  outputDirectory,
  installedVersion,
}: NormalizePagefindOutputInput): PagefindNormalizationResult {
  const pagefindDirectory = join(outputDirectory, "pagefind");
  const before = inspectPagefindArtifacts({ pagefindDirectory, installedVersion });
  throwContractErrors(before.errors);
  proveOptionalUiUnreferenced(projectRoot, outputDirectory, before.optionalUiFiles);

  for (const file of before.optionalUiFiles) {
    if (!(PAGEFIND_OPTIONAL_UI_FILES as readonly string[]).includes(file)) {
      throw new Error(`Refused to remove non-contract Pagefind artifact: ${file}.`);
    }
    unlinkSync(join(pagefindDirectory, file));
  }

  const report = inspectPagefindArtifacts({ pagefindDirectory, installedVersion });
  throwContractErrors(report.errors);
  return {
    rawTotalBytes: before.rawTotalBytes,
    removedOptionalUiBytes: before.optionalUiBytes,
    removedOptionalUiFiles: before.optionalUiFiles,
    report,
  };
}

function isMainModule(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const projectRoot = process.cwd();
  try {
    const result = normalizePagefindOutput({
      projectRoot,
      outputDirectory: resolve(projectRoot, "dist"),
      installedVersion: readInstalledPagefindVersion(projectRoot),
    });
    console.log(
      `Pagefind normalization passed: ${formatPagefindDiagnostics(
        result.report,
        result.rawTotalBytes,
        result.removedOptionalUiBytes,
      )}.`,
    );
    console.log(
      `Removed optional Pagefind UI: ${result.removedOptionalUiFiles.length > 0 ? result.removedOptionalUiFiles.join(", ") : "none (already absent)"}.`,
    );
  } catch (error) {
    console.error("Pagefind normalization failed:");
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
