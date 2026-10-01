import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

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
