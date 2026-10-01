import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import { pageInventory, siteConfig } from "../src/core/site-data";
import {
  cleanupCoreBuildFixture,
  createCoreBuildFixture,
  runFixtureNpm,
  writeFixtureGameConfig,
  writeFixtureGameConfigSource,
} from "./helpers/core-build-fixture";

let fixtureRoot: string;
const guide = pageInventory.find((page) => page.pageId === "guide.getting-started")!;
const identityConfig = defineGameConfig({
  ...siteConfig,
  identity: {
    sitePublisher: {
      identity: { kind: "Organization", name: "Site Publisher", projectConfirmed: true, evidenceRef: "entity:site-publisher" },
      evidenceRef: "role:site-publisher",
    },
    articles: {
      [guide.pageId]: {
        author: {
          identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:guide-author" },
          evidenceRef: "role:article-author",
        },
        publisher: {
          identity: { kind: "Organization", name: "Article Publisher", projectConfirmed: true, evidenceRef: "entity:article-publisher" },
          evidenceRef: "role:article-publisher",
        },
      },
    },
  },
});

beforeAll(() => {
  fixtureRoot = createCoreBuildFixture();
  writeFixtureGameConfig(fixtureRoot, identityConfig);
});

afterAll(() => {
  if (fixtureRoot) cleanupCoreBuildFixture(fixtureRoot);
});

describe("TL-02 real build safety", () => {
  it("builds explicit independent roles and keeps private evidence out of output", () => {
    const build = runFixtureNpm(fixtureRoot, "build");
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
    const htmlPath = join(fixtureRoot, "dist/guides/getting-started/index.html");
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain("Guide Author");
    expect(html).toContain("Site Publisher");
    expect(html).toContain("Article Publisher");
    expect(html).toContain("data-structured-author-id");
    expect(html).not.toContain("evidenceRef");
    expect(html).not.toContain("projectConfirmed");
  }, 60_000);

  it("makes generated-output audit reject an additional uncontrolled identity script", () => {
    writeFixtureGameConfig(fixtureRoot, identityConfig);
    const build = runFixtureNpm(fixtureRoot, "build");
    expect(build.status, build.stderr).toBe(0);
    const htmlPath = join(fixtureRoot, "dist/guides/getting-started/index.html");
    const clean = readFileSync(htmlPath, "utf8");
    writeFileSync(
      htmlPath,
      clean.replace(
        "</head>",
        '<script type="application/ld+json">{"@type":"Person","@id":"https://gameatlas.example/#identity-injected","name":"Injected"}</script></head>',
      ),
    );
    const audit = spawnSync("npm", ["exec", "--", "tsx", "scripts/audit-build.ts"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 60_000,
    });
    expect(audit.status).not.toBe(0);
    expect(`${audit.stdout}\n${audit.stderr}`).toMatch(/unconfigured controlled identity/i);
    writeFileSync(htmlPath, clean);
  }, 60_000);

  it("rejects invalid identity confirmation in final and evidence modes", () => {
    const invalid = JSON.stringify(identityConfig, null, 2).replace(
      '"projectConfirmed": true',
      '"projectConfirmed": false',
    );
    writeFixtureGameConfigSource(fixtureRoot, invalid);
    for (const script of ["build", "build:evidence"] as const) {
      const result = runFixtureNpm(fixtureRoot, script);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/projectConfirmed|invalid|literal/i);
    }
  }, 60_000);
});
