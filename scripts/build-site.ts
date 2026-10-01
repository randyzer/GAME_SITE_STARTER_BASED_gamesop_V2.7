import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runSiteValidation } from "./validate-site";

export type BuildPurpose = "final" | "evidence";

export interface BuildCommand {
  name: string;
  command: string;
  args: string[];
  validationPurpose?: BuildPurpose;
}

export const EVIDENCE_MARKER_FILE = "dist/EVIDENCE_BUILD_NOT_FINAL.json";

export const TECHNICAL_BUILD_STAGES: BuildCommand[] = [
  { name: "Astro build", command: "astro", args: ["build"] },
  {
    name: "Output reconciliation",
    command: "tsx",
    args: ["scripts/reconcile-output.ts"],
  },
  {
    name: "Pagefind generation",
    command: "pagefind",
    args: ["--site", "dist"],
  },
  {
    name: "Pagefind normalization",
    command: "tsx",
    args: ["scripts/normalize-pagefind-output.ts"],
  },
  {
    name: "Generated output audit",
    command: "tsx",
    args: ["scripts/audit-build.ts"],
  },
];

interface RunBuildInput {
  purpose: BuildPurpose;
  projectRoot: string;
  runCommand?: (command: BuildCommand) => number;
  log?: (message: string) => void;
}

function preflightFor(purpose: BuildPurpose): BuildCommand {
  return {
    name: purpose === "evidence" ? "Evidence-safe validation" : "Final validation",
    command: "internal:validate-site",
    args: [],
    validationPurpose: purpose,
  };
}

function defaultCommandRunner(projectRoot: string, command: BuildCommand): number {
  if (command.validationPurpose) {
    return runSiteValidation({ projectRoot, purpose: command.validationPurpose });
  }
  const result = spawnSync(command.command, command.args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`${command.name} could not start: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

export function runBuild({
  purpose,
  projectRoot,
  runCommand,
  log = console.log,
}: RunBuildInput): number {
  const markerPath = resolve(projectRoot, EVIDENCE_MARKER_FILE);
  if (purpose === "evidence") {
    try {
      rmSync(markerPath, { force: true });
    } catch (error) {
      console.error(
        `Stale evidence marker could not be removed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
    log("=== FRESH VISUAL EVIDENCE BUILD ===");
    log("=== NOT FINAL ===");
  }

  const runner = runCommand ?? ((command: BuildCommand) => defaultCommandRunner(projectRoot, command));
  const commands = [preflightFor(purpose), ...TECHNICAL_BUILD_STAGES.map((command) =>
    command.name === "Generated output audit" ? { ...command, args: [...command.args, "--purpose", purpose] } : command)];
  for (const command of commands) {
    const status = runner(command);
    if (status !== 0) return status;
  }

  if (purpose === "evidence") {
    try {
      mkdirSync(dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, `${JSON.stringify({ mode: "evidence", final: false }, null, 2)}\n`);
    } catch (error) {
      rmSync(markerPath, { force: true });
      console.error(
        `Evidence marker could not be written: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
    log("=== NOT FINAL CLOSING BUILD ===");
    log("=== HUMAN REVIEW REQUIRED ===");
    return 0;
  }

  if (existsSync(markerPath)) {
    console.error(
      `Canonical final build failed closed because ${EVIDENCE_MARKER_FILE} survived fresh output generation.`,
    );
    return 1;
  }
  return 0;
}

function isMainModule(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const purpose = process.argv[2];
  if (purpose !== "final" && purpose !== "evidence") {
    console.error(`Usage: tsx scripts/build-site.ts <final|evidence>`);
    process.exitCode = 1;
  } else {
    process.exitCode = runBuild({ purpose, projectRoot: process.cwd() });
  }
}
