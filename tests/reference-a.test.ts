import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import { resolvePageFreshness } from "../src/core/freshness";
import { collectOutputReconciliationErrors, routeToOutputFile } from "../src/core/output-reconciliation";
import { createMediaCatalog } from "../src/data/media/catalog";
import { parseItemFacts, parseMapFacts } from "../src/data/schemas/facts";
import { parsePageInventory, type PageInventoryEntry } from "../src/data/schemas/page-inventory";
import { cleanupCoreBuildFixture, createCoreBuildFixture, runFixtureNpm } from "./helpers/core-build-fixture";

// Fictional regression inputs, not claims about a real game's mechanics or approval.
const disclosure = "Fictional QA scenario for Starter regression testing; not a real commercial game.";
const version = "QA relay rules v1";
const source = {
  sourceUrl: "https://lantern-relay.example/guides/source-check/",
  sourceType: "editorial" as const,
  accessedAt: "2026-10-07",
  evidenceNote: "Fixture-authored fictional rules; dates are synthetic QA samples, not external game verification.",
};
const config = defineGameConfig({
  brand: { name: "Lantern Relay", shortName: "Relay", mark: "LR", tagline: "Synthetic Reference Fixture — trace a circuit before carrying a lantern." },
  site: { url: "https://lantern-relay.example", locale: "en", timezone: "UTC" },
  seo: { defaultTitle: "Lantern Relay — Synthetic Reference Fixture", titleTemplate: "%s | Lantern Relay", defaultDescription: "A fictional QA reference world with lantern equipment, relay supplies, circuit locations and clearly recorded synthetic rules." },
  social: {},
  navigation: { groups: [
    { label: "Home", pageId: "home" },
    { label: "Equipment", pageId: "hub.items", children: ["item.amber-lantern", "item.relay-cell"] },
    { label: "Circuits", pageId: "hub.maps", children: ["map.east-circuit"] },
    { label: "Guides", pageId: "hub.guides", children: ["guide.relay-overview", "guide.source-check"] },
  ] },
  homepage: { featuredPageIds: ["guide.relay-overview", "item.amber-lantern", "map.east-circuit"] },
  features: { guides: true, items: true, maps: true, heroes: false, weapons: false, tierLists: false, news: false, search: false, calculator: false, planner: false },
});

function page(overrides: Partial<PageInventoryEntry>): PageInventoryEntry {
  return {
    pageId: "home", route: "/", pageType: "home", cluster: "relay", module: "core", priority: 50,
    visibility: "public", publicationStatus: "published", contentStatus: "ready", developmentStatus: "ready",
    needsReview: true, needsUpdate: false, indexability: "index",
    title: "Lantern Relay Synthetic Reference", description: "Read the fictional Lantern Relay rules, compare equipment, and trace a circuit using this synthetic QA reference.",
    publishedAt: "2026-10-01", updatedAt: "2026-10-08", primaryKeyword: overrides.pageId ?? "relay home",
    tags: ["synthetic", "relay"], relatedPageIds: ["home"], relatedEntityRefs: [], sources: [source], confidence: "high",
    ...overrides,
  };
}
const inventory = parsePageInventory([
  page({ pageId: "home", priority: 100, description: `${disclosure} Browse lantern equipment and circuit locations before following the relay sequence.`, relatedPageIds: ["hub.items", "hub.maps", "guide.relay-overview"] }),
  page({ pageId: "hub.items", route: "/items/", pageType: "hub", module: "items", feature: "items", title: "Lantern Equipment and Relay Supplies", description: "Compare the fictional Amber Lantern and Relay Cell, then choose the equipment needed to complete the synthetic relay circuit.", relatedPageIds: ["item.amber-lantern", "item.relay-cell"] }),
  page({ pageId: "hub.maps", route: "/maps/", pageType: "hub", module: "maps", feature: "maps", title: "Lantern Relay Circuit Locations", description: "Browse fictional circuit locations and inspect the East Circuit's three stations before following the QA relay sequence.", relatedPageIds: ["map.east-circuit"] }),
  page({ pageId: "item.amber-lantern", route: "/items/amber-lantern/", pageType: "item", module: "items", feature: "items", title: "Amber Lantern — Fictional Equipment", description: "Read the fictional Amber Lantern's utility category, four-unit cost, and station-marking effect under QA relay rules v1.", entityRef: { entityType: "item", entityId: "amber-lantern" }, relatedPageIds: ["item.relay-cell", "guide.relay-overview"] }),
  page({ pageId: "item.relay-cell", route: "/items/relay-cell/", pageType: "item", module: "items", feature: "items", title: "Relay Cell — Fictional Power Supply", description: "Check the fictional Relay Cell's two-unit cost and single-station power effect before collecting three cells for the circuit.", entityRef: { entityType: "item", entityId: "relay-cell" }, relatedPageIds: ["map.east-circuit"] }),
  page({ pageId: "map.east-circuit", route: "/maps/east-circuit/", pageType: "map", module: "maps", feature: "maps", title: "East Circuit — Fictional Relay Map", description: "Locate Supply Dock, Signal Bridge and East Beacon on the small fictional East Circuit used for synthetic relay training.", entityRef: { entityType: "map", entityId: "east-circuit" }, relatedPageIds: ["guide.relay-overview"] }),
  page({ pageId: "hub.guides", route: "/guides/", pageType: "hub", module: "guides", feature: "guides", title: "Lantern Relay Rules and Source Notes", description: "Choose between the fictional relay walkthrough and a text-only source-context check; both explain their synthetic QA scope.", relatedPageIds: ["guide.relay-overview", "guide.source-check"] }),
  page({ pageId: "guide.relay-overview", route: "/guides/relay-overview/", pageType: "guide", module: "guides", feature: "guides", title: "How to Complete the Fictional Relay", description: "Prepare a lantern and three cells, light the East Circuit in order, and check the completion condition in this fictional QA walkthrough.", priority: 90, contentRef: { collection: "guides", slug: "relay-overview" }, relatedPageIds: ["item.amber-lantern", "map.east-circuit", "guide.source-check"] }),
  page({ pageId: "guide.source-check", route: "/guides/source-check/", pageType: "guide", module: "guides", feature: "guides", title: "Check Fictional Relay Source Context", description: "Separate publication, content update and synthetic source-access dates before reusing the fictional QA relay rules revision.", contentRef: { collection: "guides", slug: "source-check" }, relatedPageIds: ["guide.relay-overview"] }),
  page({ pageId: "about", route: "/about/", pageType: "about", title: "About the Lantern Relay QA Fixture", description: disclosure }),
  page({ pageId: "not-found", route: "/404.html", pageType: "not-found", title: "Lantern Relay Page Not Found", description: "This address is outside the fictional Lantern Relay index; recover by opening the homepage, equipment hub or circuit hub.", indexability: "noindex", relatedPageIds: ["home", "hub.items", "hub.maps"] }),
  ...(["privacy", "terms"] as const).map(kind => page({ pageId: kind, route: `/${kind}/`, pageType: kind, title: `Lantern Relay Unavailable ${kind}`, visibility: "private", publicationStatus: "draft", contentStatus: "draft", indexability: "noindex", legalActivation: { state: "unavailable" } })),
]);
const commonFact = { patch: version, updatedAt: "2026-10-08", sources: [source], confidence: "high" as const };
const items = parseItemFacts([
  { ...commonFact, id: "amber-lantern", slug: "amber-lantern", name: "Amber Lantern", summary: "Fictional utility equipment that marks the next unlit station on the relay route.", category: "utility", cost: 4, effect: "Marks the next unlit station; requires one Relay Cell per station." },
  { ...commonFact, id: "relay-cell", slug: "relay-cell", name: "Relay Cell", summary: "Fictional single-use power supply consumed when a relay station is lit.", category: "consumable", cost: 2, effect: "Powers exactly one station and is then consumed in the synthetic relay." },
]);
const maps = parseMapFacts([
  { ...commonFact, id: "east-circuit", slug: "east-circuit", name: "East Circuit", summary: "A fictional three-station training circuit with a fixed west-to-east relay sequence.", mode: "Synthetic relay training", size: "small", keyLocations: ["Supply Dock", "Signal Bridge", "East Beacon"] },
]);
const manifest = {
  assets: [
    { id: "relay.cover", type: "image", src: "/media/relay-cover.svg", alt: "Three amber lanterns illuminate the fictional relay circuit", caption: "Original synthetic Lantern Relay cover; not gameplay imagery.", dimensions: { width: 1200, height: 630 }, sourceUrl: source.sourceUrl, rightsRef: "fixture-authorship/relay-cover.svg", credit: { text: "Project-authored synthetic QA illustration" } },
    { id: "relay.figure", type: "image", src: "/media/relay-figure.svg", alt: "Supply Dock connects to Signal Bridge and then East Beacon, consuming one relay cell per station", caption: "Follow Supply Dock, Signal Bridge, then East Beacon; consume one cell at each station. Fictional QA diagram.", dimensions: { width: 960, height: 540 }, sourceUrl: source.sourceUrl, rightsRef: "fixture-authorship/relay-figure.svg", credit: { text: "Project-authored synthetic QA diagram" } },
  ],
  pages: [{ pageId: "home", hero: "relay.cover" }, { pageId: "guide.relay-overview", gallery: ["relay.figure"] }],
  defaultShare: "relay.cover",
};
const catalog = buildEnabledPageCatalog(config, inventory);
let fixtureRoot = "";
let validateLog = "";
let buildLog = "";
let previewPid: number | undefined;
let previewAttempted = false;
const html = (route: string) => readFileSync(join(fixtureRoot, "dist", routeToOutputFile(route)), "utf8");
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function outputIdentity(): string {
  const directory = join(fixtureRoot, "dist");
  const digest = createHash("sha256");
  const files = readdirSync(directory, { recursive: true }).map(String)
    .filter(name => statSync(join(directory, name)).isFile()).sort();
  for (const name of files) {
    const bytes = readFileSync(join(directory, name));
    digest.update(`${name}\0${bytes.length}\0`).update(bytes);
  }
  return digest.digest("hex");
}

async function startPreview(): Promise<string> {
  const port = await new Promise<number>((resolvePort, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") { reservation.close(); reject(new Error("Unable to reserve preview port")); return; }
      reservation.close(error => error ? reject(error) : resolvePort(address.port));
    });
  });
  previewAttempted = true;
  const started = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixtureRoot, encoding: "utf8", timeout: 30_000 });
  previewPid = Number(started.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined;
  console.log(`REF-A preview start exit=${started.status}\n${started.stdout}\n${started.stderr}`);
  expect(started.error).toBeUndefined();
  expect(started.status).toBe(0);
  expect(previewPid).toBeDefined();
  const base = `http://127.0.0.1:${port}`;
  expect(started.stdout).toContain(base);
  let ready = false;
  for (let retry = 0; retry < 60; retry++) {
    expect(pidAlive(previewPid!)).toBe(true);
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(500) })).status === 200; } catch { /* bounded readiness retry */ }
    if (ready) break;
    await pause(100);
  }
  expect(ready).toBe(true);
  return base;
}

async function stopPreview(): Promise<void> {
  const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixtureRoot, encoding: "utf8", timeout: 15_000 });
  console.log(`REF-A preview stop exit=${stopped.status}\n${stopped.stdout}\n${stopped.stderr}`);
  expect(stopped.error).toBeUndefined();
  expect(stopped.status).toBe(0);
  expect(previewPid).toBeDefined();
  for (let retry = 0; previewPid && pidAlive(previewPid) && retry < 30; retry++) await pause(100);
  expect(pidAlive(previewPid!)).toBe(false);
  console.log(`REF-A owned preview PID ${previewPid} stopped normally.`);
  previewAttempted = false;
  previewPid = undefined;
}

beforeAll(async () => {
  fixtureRoot = createCoreBuildFixture("starter-reference-a-");
  console.log(`REF-A fixture: ${fixtureRoot}`);
  writeFileSync(join(fixtureRoot, "game.config.ts"), `import { defineGameConfig } from "./src/config/schema";\nexport default defineGameConfig(${JSON.stringify(config, null, 2)});\n`);
  writeFileSync(join(fixtureRoot, "src/data/page-inventory.json"), JSON.stringify(inventory, null, 2));
  for (const [module, facts] of [["items", items], ["maps", maps]] as const) {
    writeFileSync(join(fixtureRoot, `src/data/facts/${module}.json`), JSON.stringify(facts, null, 2));
  }
  rmSync(join(fixtureRoot, "src/content/guides"), { recursive: true });
  mkdirSync(join(fixtureRoot, "src/content/guides"));
  writeFileSync(join(fixtureRoot, "src/content/guides/relay-overview.mdx"), `---
pageId: guide.relay-overview
faq:
  - question: How many cells does the East Circuit require?
    answer: Three fictional Relay Cells, one for each station. These are QA rules, not real-game data.
---

${disclosure}

Carry the Amber Lantern and three Relay Cells. Light Supply Dock, Signal Bridge, then East Beacon in that order.

## Prepare the relay

The Amber Lantern costs 4 fictional units. Each Relay Cell costs 2; three cells cost 6. The complete kit costs 10 fictional units under ${version}.

1. Read the [Amber Lantern equipment record](/items/amber-lantern/).
2. Collect three cells and enter the [East Circuit](/maps/east-circuit/).

## Light the three stations

1. Light Supply Dock with the first cell.
2. Cross Signal Bridge and consume the second cell.
3. Light East Beacon with the final cell. All three stations lit is the completion condition.

If a station remains unlit, return to it with one cell; do not skip ahead.

## Check the source context

Next, [check the synthetic source notes](/guides/source-check/) before reusing these QA rules. Publication, update and source-access dates describe different events. ${version} is a fictional fixture revision.
`);
  writeFileSync(join(fixtureRoot, "src/content/guides/source-check.mdx"), `---
pageId: guide.source-check
---

${disclosure}

## Identify the QA revision

Read ${version} before using any value. These are fixture-authored rules; they were not verified against a real game.

## Separate the recorded dates

Publication is 2026-10-01; content update is 2026-10-08; synthetic source access is 2026-10-07. A source-check date is not a verified-at claim.

This text-only task needs no image: exact dates and the revision label completely answer it. Next, [return to the relay guide](/guides/relay-overview/).
`);
  rmSync(join(fixtureRoot, "public/media/qa-default-share.svg"));
  rmSync(join(fixtureRoot, "public/logo.svg"));
  for (const asset of ["relay-cover.svg", "relay-figure.svg"]) {
    cpSync(resolve("tests/fixtures/reference-media", asset), join(fixtureRoot, "public/media", asset));
  }
  writeFileSync(join(fixtureRoot, "src/data/media/media.json"), JSON.stringify(manifest, null, 2));
  mkdirSync(join(fixtureRoot, "docs"));
  const headings = "pageId_or_route | page_family | media_need | need_rationale | intended_placement | candidate_state | rights_state | human_decision | integration_state | visual_gate_state | source_or_provenance | owner_or_defer_reason | notes";
  const rows = catalog.map(entry => {
    const hasMedia = ["home", "guide.relay-overview"].includes(entry.pageId);
    return [entry.pageId, entry.pageType, hasMedia ? "HIGH PRIORITY" : "NO MEDIA NEEDED",
      hasMedia ? "Original synthetic cover or circuit diagram explains the fictional QA world." : "MC-04: text and links completely answer this fixture task; no explanatory image is necessary.",
      hasMedia ? (entry.pageId === "home" ? "hero" : "gallery") : "none",
      hasMedia ? "FOUND" : "NOT FOUND", hasMedia ? "VERIFIED" : "NOT REQUIRED FOR EMBED", "PENDING",
      hasMedia ? "INTEGRATED" : "NOT INTEGRATED", "PENDING", "Fixture-authored rules and original SVG primitives; not external gameplay imagery.",
      "Independent Human and visual review not yet performed.", "Synthetic technical evidence only; not an approval record."].join(" | ");
  });
  writeFileSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), `# Synthetic QA media decisions\n\n| ${headings} |\n| ${headings.split(" | ").map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row} |`).join("\n")}\n`);
  const screenshotPath = resolve("tests/fixtures/reference-media/ref-a-ui.png");
  const evidenceDirectory = process.env.V27_REF_A_EVIDENCE_DIR;
  if (process.env.V27_REF_A_CAPTURE === "1") {
    if (existsSync(screenshotPath)) throw new Error("Capture target already exists; recapture requires a separately reviewed scope.");
    if (!evidenceDirectory) throw new Error("Capture requires an outside-project evidence directory for provenance.");
    const destination = realpathSync(evidenceDirectory);
    if (!relative(process.cwd(), destination).startsWith("../")) throw new Error("Capture evidence must be outside the source project.");
    const seed = runFixtureNpm(fixtureRoot, "build:evidence");
    console.log(`REF-A S2 seed build:evidence exit=${seed.status}\n${seed.stdout}\n${seed.stderr}`);
    expect(seed.error).toBeUndefined();
    expect(seed.status).toBe(0);
    const seedOutputSha256 = outputIdentity();
    cpSync(join(fixtureRoot, "dist"), join(destination, "seed-generated-output"), { recursive: true, errorOnExist: true, force: false });
    const base = await startPreview();
    const browser = await chromium.launch({ headless: true });
    try {
      const viewport = { width: 1280, height: 960 };
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const response = await page.goto(`${base}/guides/relay-overview/`, { waitUntil: "networkidle", timeout: 15_000 });
        expect(response?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('img[src="/media/relay-figure.svg"]').waitFor({ state: "visible" });
        expect(await page.locator("body").innerText()).toContain(disclosure);
        expect(await page.locator("body").innerText()).toContain(version);
        expect(await page.locator('img[src="/media/relay-figure.svg"]').evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
        await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
        const png = readFileSync(screenshotPath);
        const capture = {
          kind: "synthetic fixture UI capture", route: "/guides/relay-overview/", captureUrl: `${base}/guides/relay-overview/`,
          browser: "Playwright Chromium", browserVersion: browser.version(), playwrightVersion: "1.63.0", viewport,
          deviceScaleFactor: 1, reducedMotion: "reduce", fullPage: true, capturedAt: new Date().toISOString(),
          seedOutputSha256, pngSha256: createHash("sha256").update(png).digest("hex"),
          pngDimensions: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
          source: "Current repaired Candidate working tree; source Git identity and dependency hashes recorded in REF_A_TECH_EVIDENCE_V1.md.",
          humanApproval: "PENDING", gameplayImage: false,
        };
        writeFileSync(join(destination, "capture-provenance.json"), JSON.stringify(capture, null, 2));
        console.log(`REF-A S2 actual capture provenance: ${JSON.stringify(capture)}`);
      } finally { await context.close(); }
    } finally {
      await browser.close();
      await stopPreview();
    }
  }
  const png = readFileSync(screenshotPath);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  // Pin the reviewed capture bytes; ordinary test runs never regenerate this asset.
  expect(createHash("sha256").update(png).digest("hex")).toBe("fcb9089258d342c8d38432f3f3978836e2701d0f91c5357330544eca52844953");
  const screenshotDimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  expect(screenshotDimensions.width).toBe(1280);
  expect(screenshotDimensions.height).toBeGreaterThan(960);
  manifest.assets.push({ id: "relay.ui-capture", type: "image", src: "/media/ref-a-ui.png",
    alt: "Actual synthetic Lantern Relay guide UI with relay instructions, contents navigation and circuit diagram",
    caption: "Actual synthetic fixture UI capture of the relay guide before screenshot integration; not gameplay imagery. Human review pending.",
    dimensions: screenshotDimensions, sourceUrl: "https://lantern-relay.example/guides/relay-overview/",
    rightsRef: "fixture-authorship/ref-a-ui.png", credit: { text: "Project-authored fixture UI captured with Playwright Chromium" } });
  manifest.pages[1].gallery!.push("relay.ui-capture");
  cpSync(screenshotPath, join(fixtureRoot, "public/media/ref-a-ui.png"));
  writeFileSync(join(fixtureRoot, "src/data/media/media.json"), JSON.stringify(manifest, null, 2));
  // Final validation must reject pending Human/visual approval; evidence build must not erase it.
  const validation = runFixtureNpm(fixtureRoot, "validate");
  validateLog = `${validation.stdout}\n${validation.stderr}`;
  console.log(`REF-A npm run validate exit=${validation.status}\n${validateLog}`);
  expect(validation.error).toBeUndefined();
  expect(validation.status).toBe(1);
  expect(validateLog.split("\n").filter(line => line.startsWith("- "))).toEqual([
    "- Media readiness home (/) is HIGH PRIORITY and pending; unresolved media is not resolved by Starter projection.",
    "- Media readiness guide.relay-overview (/guides/relay-overview/) is HIGH PRIORITY and pending; unresolved media is not resolved by Starter projection.",
  ]);
  const build = runFixtureNpm(fixtureRoot, "build:evidence");
  buildLog = `${build.stdout}\n${build.stderr}`;
  console.log(`REF-A npm run build:evidence exit=${build.status}\n${buildLog}`);
  expect(build.error).toBeUndefined();
  expect(build.status).toBe(0);
  console.log(`REF-A S2 final output SHA256: ${outputIdentity()}`);
  // Optional external evidence export; the fixture itself is always removed.
  if (evidenceDirectory) {
    const destination = realpathSync(evidenceDirectory);
    if (!relative(process.cwd(), destination).startsWith("../")) throw new Error("Evidence export must be outside the source project.");
    cpSync(join(fixtureRoot, "dist"), join(destination, "generated-output"), { recursive: true, errorOnExist: true, force: false });
    cpSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), join(destination, "fixture-media-decisions.md"), { errorOnExist: true, force: false });
    console.log(`REF-A generated output exported: ${destination}`);
  }
}, 180_000);

afterAll(async () => {
  let cleanupError: unknown;
  try {
    if (previewAttempted) {
      await stopPreview();
    }
  } catch (error) {
    cleanupError = error;
    if (previewPid && pidAlive(previewPid)) {
      process.kill(previewPid, "SIGTERM");
      for (let retry = 0; pidAlive(previewPid) && retry < 30; retry++) await pause(100);
      if (pidAlive(previewPid)) process.kill(previewPid, "SIGKILL");
      console.error("REF-A owned preview required fallback termination; cleanup verification FAILED.");
    }
  } finally {
    if (fixtureRoot) {
      cleanupCoreBuildFixture(fixtureRoot);
      expect(existsSync(fixtureRoot)).toBe(false);
      console.log("REF-A temporary fixture removed.");
    }
  }
  if (cleanupError) throw cleanupError;
}, 30_000);

describe("REF-A synthetic seed through existing Starter consumers", () => {
  it("validates authorities, enabled relationships and date/version separation", () => {
    expect(catalog).toHaveLength(11);
    const ids = new Set(catalog.map(entry => entry.pageId));
    for (const entry of catalog) for (const id of entry.relatedPageIds) expect(ids.has(id), `${entry.pageId} -> ${id}`).toBe(true);
    expect(parseItemFacts(items)).toHaveLength(2);
    expect(parseMapFacts(maps)).toHaveLength(1);
    const media = createMediaCatalog(manifest, inventory.map(entry => entry.pageId), src => existsSync(join(fixtureRoot, "public", src)));
    expect(media.getPageMedia("guide.relay-overview").galleryMedia).toHaveLength(2);
    expect(media.getPageMedia("guide.source-check")).toEqual({ galleryMedia: [] });
    const freshness = resolvePageFreshness(inventory[7], { kind: "version", value: version });
    expect(freshness).toEqual({ publishedAt: "2026-10-01", updatedAt: "2026-10-08", sourceCheckedAt: "2026-10-07", versionContext: { kind: "version", value: version } });
    expect(freshness).not.toHaveProperty("verifiedAt");
    expect(() => parsePageInventory([...inventory, inventory[0]])).toThrow(/Duplicate/);
    expect(() => parsePageInventory([{ ...inventory[0], updatedAt: "2026-09-30" }])).toThrow(/updatedAt/);
    expect(() => createMediaCatalog(manifest, [])).toThrow(/Unknown inventory page/);
    expect(() => createMediaCatalog(manifest, inventory.map(entry => entry.pageId), () => false)).toThrow(/does not exist/);
  });

  it("generates the exact enabled catalog and passes existing output audits", () => {
    expect(collectOutputReconciliationErrors(catalog, join(fixtureRoot, "dist"))).toEqual([]);
    expect(buildLog).toContain("Static output reconciliation passed: 11 inventory routes matched.");
    expect(buildLog).toContain("Generated build audit passed for 11 pages.");
    for (const entry of catalog) {
      expect(html(entry.route)).toContain('id="main-content"');
      console.log(`REF-A generated route PASS ${entry.route}`);
    }
    expect(JSON.parse(readFileSync(join(fixtureRoot, "dist/EVIDENCE_BUILD_NOT_FINAL.json"), "utf8"))).toMatchObject({ mode: "evidence", final: false });
    for (const route of ["/privacy/", "/terms/", "/search/", "/heroes/demo-sentinel/"]) expect(existsSync(join(fixtureRoot, "dist", routeToOutputFile(route)))).toBe(false);
  });

  it("renders editorial identity, taxonomy navigation and three distinct fact records", () => {
    const home = html("/");
    expect(home).toContain(disclosure);
    for (const route of ["/items/", "/maps/", "/guides/relay-overview/", "/items/amber-lantern/", "/maps/east-circuit/"]) expect(home).toContain(`href="${route}"`);
    expect(html("/items/")).toContain("Amber Lantern");
    expect(html("/items/")).toContain("Relay Cell");
    expect(html("/maps/")).toContain("East Circuit");
    expect(html("/items/amber-lantern/")).toContain(items[0].effect);
    expect(html("/items/relay-cell/")).toContain(items[1].effect);
    expect(html("/maps/east-circuit/")).toContain("Signal Bridge");
    for (const route of ["/items/amber-lantern/", "/items/relay-cell/", "/maps/east-circuit/"]) expect(html(route)).toContain(version);
  });

  it("renders ordinary MDX answers, steps, TOC, FAQ and ordered manual relationships", () => {
    const guide = html("/guides/relay-overview/");
    expect(guide).toContain('class="article wiki-article shell"');
    for (const heading of ["prepare-the-relay", "light-the-three-stations", "check-the-source-context"]) {
      expect(guide).toContain(`href="#${heading}"`);
      expect(guide).toContain(`id="${heading}"`);
    }
    expect(guide).toMatch(/<ol>\s*<li>Read the/);
    expect(guide).toContain("completion condition");
    expect(guide).toContain("If a station remains unlit");
    expect(guide).toContain("How many cells does the East Circuit require?");
    expect(guide).toContain("Three fictional Relay Cells");
    const related = guide.match(/<nav[^>]*aria-label="Related pages"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect([...related.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual(["/items/amber-lantern/", "/maps/east-circuit/", "/guides/source-check/"]);
    expect(guide).toContain('datetime="2026-10-01"');
    expect(guide).toContain('datetime="2026-10-08"');
    expect(guide).toContain('datetime="2026-10-07"');
    expect(guide).toContain("Sources checked");
    expect(guide).toContain(source.sourceUrl);
    expect(guide).toContain(version);
  });

  it("integrates distinct original cover/figure without claiming screenshots or empty media", () => {
    const home = html("/");
    const guide = html("/guides/relay-overview/");
    expect(home).toMatch(/<img\b[^>]*src="\/media\/relay-cover\.svg"/);
    expect(home).toContain(manifest.assets[0].alt);
    expect(home).toContain('width="1200"');
    expect(home).toContain('height="630"');
    expect(guide).toMatch(/<img\b[^>]*src="\/media\/relay-figure\.svg"/);
    for (const value of [manifest.assets[1].alt, manifest.assets[1].caption, manifest.assets[1].credit.text]) expect(guide).toContain(value);
    expect(guide).toContain('width="960"');
    expect(guide).toContain('height="540"');
    const cover = readFileSync(join(fixtureRoot, "dist/media/relay-cover.svg"), "utf8");
    const figure = readFileSync(join(fixtureRoot, "dist/media/relay-figure.svg"), "utf8");
    expect(cover).not.toBe(figure);
    for (const value of [cover, figure]) expect(value).toMatch(/<svg\b/);
    expect(figure).toContain("Supply Dock");
    expect(figure).toContain("Signal Bridge");
    expect(figure).toContain("East Beacon");
    expect(guide).toMatch(/<img\b[^>]*src="\/media\/ref-a-ui\.png"/);
    expect(guide).toContain(manifest.assets[2].alt);
    expect(guide).toContain(manifest.assets[2].caption);
    const outputPng = readFileSync(join(fixtureRoot, "dist/media/ref-a-ui.png"));
    expect(outputPng.equals(readFileSync(resolve("tests/fixtures/reference-media/ref-a-ui.png")))).toBe(true);
    expect(manifest.assets.map(asset => asset.src)).toEqual(["/media/relay-cover.svg", "/media/relay-figure.svg", "/media/ref-a-ui.png"]);
    const plain = html("/guides/source-check/");
    expect(plain).toContain("exact dates and the revision label completely answer it");
    expect(plain).not.toMatch(/<iframe\b|data-media-placement|class="game-media/);
    const decisions = readFileSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), "utf8");
    expect(decisions).toContain("guide.source-check | guide | NO MEDIA NEEDED | MC-04:");
    expect(decisions).not.toMatch(/APPROVED|WAIVED|HUMAN RISK ACCEPTED/);
    console.log("REF-A screenshot=TECHNICAL_CAPTURE_BOUND; browser acceptance/keyboard/CLS/obstruction/Safari/AX=NOT_RUN; Human media/visual=PENDING; full REF-A/WS06B/PRODUCT/RELEASE=NOT_ACCEPTED.");
  });

  it("retains canonical/schema/SEO/legal safety and rejects inherited identity residue", () => {
    for (const entry of catalog) {
      const output = html(entry.route);
      expect(output).toContain(`rel="canonical" href="${new URL(entry.route, config.site.url).href}"`);
      expect(output).toContain('property="og:image" content="https://lantern-relay.example/media/relay-cover.svg"');
      expect(output).not.toMatch(/Game Atlas|gameatlas\.example|@gameatlas|Demo Sentinel|liveStatus|observed-live|not-live|Observed live|Status source|rightsRef|fixture-authorship/);
      expect(output).not.toContain(source.evidenceNote);
      expect(output).not.toMatch(/href="\/(?:privacy|terms)\/"/);
    }
    const schemas = [...html("/guides/relay-overview/").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    expect(JSON.stringify(schemas)).toContain('"@type":"Article"');
    expect(JSON.stringify(schemas)).toContain('"@type":"BreadcrumbList"');
    expect(JSON.stringify(schemas)).not.toMatch(/"(?:author|publisher)"/);
    const sitemap = readFileSync(join(fixtureRoot, "dist/sitemap-0.xml"), "utf8");
    for (const entry of catalog.filter(entry => entry.indexability === "index")) expect(sitemap).toContain(new URL(entry.route, config.site.url).href);
    expect(sitemap).not.toMatch(/\/privacy\/|\/terms\/|404\.html/);
    expect(readFileSync(join(fixtureRoot, "dist/robots.txt"), "utf8")).toContain("https://lantern-relay.example/sitemap-index.xml");
    expect(readFileSync(join(fixtureRoot, "dist/sitemap-index.xml"), "utf8")).toContain("https://lantern-relay.example/sitemap-0.xml");
  });

  it("returns actual HTTP 404 and working recovery destinations from the owned preview", async () => {
    const base = await startPreview();
    const missing = await fetch(`${base}/missing-relay-route/`, { signal: AbortSignal.timeout(3000) });
    expect(missing.status).toBe(404);
    const body = await missing.text();
    expect(body).toContain("Lantern Relay Page Not Found");
    const recovery = body.match(/<nav[^>]*aria-label="Recovery links"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    const routes = [...recovery.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    expect(routes).toEqual(["/", "/items/", "/maps/"]);
    for (const route of routes) expect((await fetch(`${base}${route}`, { signal: AbortSignal.timeout(3000) })).status).toBe(200);
    console.log("REF-A actual HTTP missing route=404; recovery /=200 /items/=200 /maps/=200.");
  }, 45_000);
});
