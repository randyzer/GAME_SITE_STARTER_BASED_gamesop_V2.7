import { createCoreBuildFixture, adoptFixtureConfig } from "./helpers/core-build-fixture";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import {
  resolveNavigationGroups,
  siteConfig,
} from "../src/core/site-data";
import { collectOutputReconciliationErrors, routeToOutputFile } from "../src/core/output-reconciliation";
import { getSitemapRoutes } from "../src/core/seo";
import mediaFixture from "./fixtures/media/media-rich.json";
import { parsePageInventory } from "../src/data/schemas/page-inventory";

let fixtureRoot: string;
let buildLog = "";
const projectRoot = process.cwd();
const mediaBuildConfig = defineGameConfig({
  ...siteConfig,
  brand: { name: "Field Notes", shortName: "Field", mark: "FN", logoPath: "/logo.svg", tagline: "Synthetic editorial QA project." },
  navigation: {
    groups: [
      { label: "Home", pageId: "home" },
      {
        label: "Guides",
        pageId: "hub.guides",
        children: ["guide.getting-started"],
      },
      { label: "Search", pageId: "search" },
    ],
  },
  homepage: { featuredPageIds: ["guide.getting-started"] },
  features: {
    ...siteConfig.features,
    guides: true,
    heroes: false,
    weapons: false,
    items: false,
    maps: false,
    tierLists: false,
    news: false,
    search: true,
    calculator: false,
    planner: false,
  },
});
let mediaBuildCatalog: ReturnType<typeof buildEnabledPageCatalog>;
let mediaBuildNavigation: ReturnType<typeof resolveNavigationGroups>;

beforeAll(() => {
  fixtureRoot = createCoreBuildFixture();
  mediaBuildCatalog = buildEnabledPageCatalog(mediaBuildConfig,
    parsePageInventory(JSON.parse(readFileSync(join(fixtureRoot, "src/data/page-inventory.json"), "utf8"))));
  mediaBuildNavigation = resolveNavigationGroups(mediaBuildConfig.navigation.groups, mediaBuildCatalog);
  // This test replaces the manifest, so remove the helper-owned default asset as well.
  rmSync(join(fixtureRoot, "public/media/qa-default-share.svg"));
  writeFileSync(
    join(fixtureRoot, "game.config.ts"),
    `import { defineGameConfig } from "./src/config/schema";\n\nexport default defineGameConfig(${JSON.stringify(adoptFixtureConfig(mediaBuildConfig), null, 2)});\n`,
  );
  writeFileSync(join(fixtureRoot, "src/data/media/media.json"), JSON.stringify({
    ...mediaFixture,
    defaultShare: "qa.overview",
    assets: mediaFixture.assets.map(asset => {
      // Explicit migration of these known synthetic assets; never a production schema default.
      if (asset.id === "qa.overview") return { ...asset, dimensions: { width: 1200, height: 675 }, rightsRef: "private/qa-overview" };
      if (asset.id === "qa.detail") return { ...asset, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-detail" };
      if (asset.id === "qa.trailer") return { ...asset, dimensions: { width: 1920, height: 1080 }, rightsRef: "private/qa-trailer", accessibleEquivalent: { kind: "text", text: "Public animation test trailer, with no game association." } };
      throw new Error(`Unmigrated synthetic media asset: ${asset.id}`);
    }),
  }));
  for (const file of ["qa-overview.svg", "qa-detail.svg"]) {
    cpSync(resolve(projectRoot, "tests/fixtures/media", file), join(fixtureRoot, "public/media", file));
  }
  buildLog = execFileSync("npm", ["run", "build"], {
    cwd: fixtureRoot,
    encoding: "utf8",
    timeout: 60_000,
    // Vitest's NODE_ENV=test must not select development React for the production build.
    env: { ...process.env, NODE_ENV: "production" },
  });
}, 60_000);

afterAll(() => {
  if (!fixtureRoot) return;
  if (process.env.STARTER_MEDIA_QA_KEEP === "1") {
    console.log(`Media QA fixture retained at: ${fixtureRoot}`);
  } else {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe("media-rich static build", () => {
  it("preserves exact inventory routes and Pagefind inclusion", () => {
    const routeCount = mediaBuildCatalog.length;
    const indexableCount = getSitemapRoutes(mediaBuildCatalog).length;

    expect(collectOutputReconciliationErrors(mediaBuildCatalog, join(fixtureRoot, "dist"))).toEqual([]);
    expect(buildLog).toContain(`Static output reconciliation passed: ${routeCount} inventory routes matched.`);
    expect(buildLog).toMatch(new RegExp(`Indexed ${indexableCount} pages?`));
    expect(buildLog).toContain(`Generated build audit passed for ${routeCount} pages.`);
    expect(existsSync(join(fixtureRoot, "dist/heroes/demo-sentinel/index.html"))).toBe(false);
  });

  it("renders all fixed guide placements and retains no-media pages", () => {
    const rich = readFileSync(join(fixtureRoot, "dist/guides/getting-started/index.html"), "utf8");
    expect(rich.match(/<img\b[^>]*src="\/media\//g)).toHaveLength(3);
    expect(rich.match(/<iframe\b/g)).toHaveLength(1);
    for (const placement of ["hero", "gallery", "trailer"]) expect(rich).toContain(`data-media-placement="${placement}"`);
    expect(rich).toContain('loading="eager"');
    expect(rich).toContain("youtube-nocookie.com/embed/aqz-KE-bpKQ");
    const plain = readFileSync(join(fixtureRoot, "dist/about/index.html"), "utf8");
    expect(plain).not.toMatch(/<iframe\b|data-media-placement|class="game-media/);
  });

  it("preserves every resolved desktop/mobile navigation link", () => {
    const expected = mediaBuildNavigation.flatMap((group) => [group.page, ...group.children]);
    for (const page of mediaBuildCatalog) {
      const html = readFileSync(join(fixtureRoot, "dist", routeToOutputFile(page.route)), "utf8");
      for (const className of ["desktop-nav", "mobile-nav__panel"]) {
        const nav = html.match(new RegExp(`<nav class="${className}"[^>]*>([\\s\\S]*?)</nav>`))?.[1] ?? "";
        expect([...nav.matchAll(/data-nav-page-id="([^"]+)"/g)].map((match) => match[1])).toEqual(expected.map((item) => item.pageId));
        expect([...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual(expected.map((item) => item.route));
      }
    }
  });

  it("fails CLI validation for a missing referenced file without network probes", () => {
    const path = join(fixtureRoot, "public/media/qa-detail.svg");
    rmSync(path);
    try {
      expect(() => execFileSync("npm", ["run", "validate"], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe" })).toThrow();
    } finally {
      cpSync(resolve(projectRoot, "tests/fixtures/media/qa-detail.svg"), path);
    }
  });
});

it("builds WS03B explicit media information without private rights references", () => {
  const html = readFileSync(join(fixtureRoot, "dist/guides/getting-started/index.html"), "utf8");
  expect(html).toContain('width="1200"');
  expect(html).toContain('height="675"');
  expect(html).toContain('class="media-equivalent"');
  expect(html).not.toContain("rightsRef");
  expect(html).not.toContain("private/qa-");
});


it("generates page hero fallback and project default share metadata without a visual share placement", () => {
  for (const route of ["guides/getting-started/index.html", "about/index.html"]) {
    const html = readFileSync(join(fixtureRoot, "dist", route), "utf8");
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="675"');
    expect(html).toContain('name="twitter:image"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain('data-media-placement="share"');
    expect(html).not.toContain("private/qa-");
  }
});


it("rejects a final indexable build with no share references and no image fallback", () => {
  const path = join(fixtureRoot, "src/data/media/media.json");
  const original = readFileSync(path, "utf8");
  const registered = JSON.parse(original);
  writeFileSync(path, JSON.stringify({ assets: registered.assets, pages: [] }));
  try {
    expect(() => execFileSync("npm", ["run", "build"], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } })).toThrow(/share image.*required/i);
  } finally {
    writeFileSync(path, original);
    execFileSync("npm", ["run", "build"], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } });
  }
}, 60_000);

it.each(["url", "dimensions", "alt"])("rejects actual generated share metadata tampering: %s", field => {
  const path = join(fixtureRoot, "dist/guides/getting-started/index.html");
  const original = readFileSync(path, "utf8");
  const property = field === "url" ? "og:image" : field === "dimensions" ? "og:image:width" : "og:image:alt";
  const pattern = new RegExp(`(<meta property="${property}" content=")[^"]*(")`);
  expect(original).toMatch(pattern);
  const tampered = original.replace(pattern, '$1invalid-share-value$2');
  writeFileSync(path, tampered);
  try {
    expect(() => execFileSync(join(fixtureRoot, "node_modules/.bin/tsx"), ["scripts/audit-build.ts"], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe" })).toThrow(/share metadata/i);
  } finally { writeFileSync(path, original); }
}, 30_000);
