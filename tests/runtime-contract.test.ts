import { existsSync, readFileSync } from "node:fs";
import type { SpawnSyncReturns } from "node:child_process";

import { describe, expect, it } from "vitest";
import { assertVerificationResult } from "../scripts/verify-adoption";

const activeDocs = [
  "../README.md",
  "../docs/CONTENT_AND_DATA_GUIDE.md",
  "../docs/QA_CHECKLIST.md",
  "../docs/DEPLOYMENT.md",
  "../docs/media/README.md",
] as const;

function read(path: string): string {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), `${url.pathname} exists`).toBe(true);
  return readFileSync(url, "utf8");
}

describe("Node runtime contract", () => {
  it("keeps CI gates explicit and leaves the canonical final build unchanged", () => {
    const ci = read("../.github/workflows/ci.yml");
    const pkg = JSON.parse(read("../package.json"));
    expect(ci).toContain("run: npm run check");
    expect(ci).toContain("run: npm run verify:unadopted-final");
    expect(ci).toContain("run: npm run verify:adopted-final");
    expect(ci).not.toMatch(/^\s*run: npm run build\s*$/m);
    expect(pkg.scripts.build).toBe("tsx scripts/build-site.ts final");
    expect(pkg.scripts["build:evidence"]).toBe("tsx scripts/build-site.ts evidence");
    expect(pkg.scripts["verify:unadopted-final"]).toBe("tsx scripts/verify-adoption.ts unadopted");
    expect(pkg.scripts["verify:adopted-final"]).toBe("tsx scripts/verify-adoption.ts adopted");
    for (const file of ["../scripts/validate-site.ts", "../scripts/core-safety-sentinels.ts", "../scripts/audit-build.ts"]) {
      expect(read(file)).not.toContain("STARTER_ADOPTION_FIXTURE");
    }
  });

  it("rejects unrelated failures, unexpected success and incomplete child commands", () => {
    const result = (status: number | null, stderr = "", extra = {}): SpawnSyncReturns<string> =>
      ({ status, stderr, stdout: "", signal: null, ...extra } as SpawnSyncReturns<string>);
    expect(() => assertVerificationResult(result(1, "- PP-02 core.brand residue on branding."), "pp02-rejection")).not.toThrow();
    expect(() => assertVerificationResult(result(0), "success")).not.toThrow();
    for (const failure of [result(0, "- PP-02 core.brand residue"), result(1, "Cannot find module"),
      result(null, "- PP-02 core.brand residue"), result(1, "- PP-02 core.brand residue", { error: new Error("ENOENT") }),
      result(1, "- PP-02 core.brand residue", { signal: "SIGTERM" })]) {
      expect(() => assertVerificationResult(failure, "pp02-rejection")).toThrow();
    }
    expect(() => assertVerificationResult(result(1), "success")).toThrow();
  });

  it("pins the intended runtime to Node 22.22.0 and constrains engines to Node 22 only", () => {
    const packageJson = JSON.parse(read("../package.json")) as {
      engines?: { node?: string };
    };
    const packageLock = JSON.parse(read("../package-lock.json")) as {
      packages?: { "": { engines?: { node?: string } } };
    };

    expect(read("../.nvmrc").trim()).toBe("22.22.0");
    expect(packageJson.engines?.node).toBe(">=22.19.0 <23");
    expect(packageLock.packages?.[""].engines?.node).toBe(">=22.19.0 <23");
  });

  it("keeps active runtime documentation aligned with the Node 22-only contract", () => {
    for (const path of activeDocs) {
      const source = read(path);
      expect(source).not.toMatch(/Node\s*(?:\.js)?\s*24|>=22(?:\s|`|$)|<23\s*\|\|/i);
    }

    expect(read("../README.md")).toMatch(/Node\.js `22\.22\.0` from `\.nvmrc`/);
    expect(read("../docs/QA_CHECKLIST.md")).toMatch(/Node `22\.22\.0` from `\.nvmrc`/);
    expect(read("../docs/DEPLOYMENT.md")).toMatch(/Node version: `22\.22\.0`/);
    expect(read("../.github/workflows/ci.yml")).toMatch(/node-version-file: \.nvmrc/);
  });
});
