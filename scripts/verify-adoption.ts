import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupCoreBuildFixture, createFullProjectFixture } from "../tests/helpers/core-build-fixture";

export function assertVerificationResult(result: SpawnSyncReturns<string>, expected: "success" | "pp02-rejection"): void {
  if (result.error || result.signal || result.status === null) {
    throw new Error(`Child command did not complete: ${result.error?.message ?? result.signal ?? "no exit status"}`);
  }
  if (expected === "success" ? result.status !== 0 : result.status === 0 || !/(?:^|\n)- PP-02 /m.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(`Expected ${expected}; received exit ${result.status}.`);
  }
}

export function verifyAdoption(mode: "unadopted" | "adopted"): void {
  const fixtureRoot = createFullProjectFixture(mode === "adopted");
  try {
    const commands = mode === "adopted" ? ["validate", "check", "build"] : ["validate", "build"];
    for (const script of commands) {
      console.log(`ADOPTION ${mode}: npm run ${script}`);
      const result = spawnSync("npm", ["run", script], {
        cwd: fixtureRoot,
        encoding: "utf8",
        timeout: script === "check" ? 300_000 : 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, STARTER_ADOPTION_FIXTURE: mode === "adopted" ? "1" : "0" },
      });
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      assertVerificationResult(result, mode === "adopted" ? "success" : "pp02-rejection");
      console.log(`ADOPTION ${mode}: ${script} exit=${result.status}; ${mode === "adopted" ? "PASS" : "EXPECTED_PP02_REJECTION"}`);
    }
    if (mode === "adopted") {
      for (const path of ["EVIDENCE_BUILD_NOT_FINAL.json", "privacy/index.html", "terms/index.html"]) {
        if (existsSync(join(fixtureRoot, "dist", path))) throw new Error(`Unexpected final artifact: ${path}`);
      }
      console.log("ADOPTION adopted: final marker and unapproved legal routes ABSENT; synthetic technical proof only.");
    }
  } finally {
    cleanupCoreBuildFixture(fixtureRoot);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== "unadopted" && mode !== "adopted") {
    console.error("Usage: verify-adoption.ts unadopted|adopted");
    process.exitCode = 1;
  } else {
    try { verifyAdoption(mode); }
    catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
