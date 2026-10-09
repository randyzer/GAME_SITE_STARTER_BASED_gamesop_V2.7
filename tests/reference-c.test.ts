import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineGameConfig } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import { collectOutputReconciliationErrors, routeToOutputFile } from "../src/core/output-reconciliation";
import { createMediaCatalog } from "../src/data/media/catalog";
import { parsePageInventory, type PageInventoryEntry } from "../src/data/schemas/page-inventory";
import { cleanupCoreBuildFixture, createCoreBuildFixture, runFixtureNpm } from "./helpers/core-build-fixture";

const disclosure = "Fictional QA scenario for Starter regression testing; not a real commercial game.";
const source = { sourceUrl: "https://lantern-systems.example/meta/relay-priorities/", sourceType: "editorial" as const, accessedAt: "2026-10-07", evidenceNote: "Fixture-authored synthetic systems and editorial tag counts; no verified real-game mechanics or Human identity approval." };
const config = defineGameConfig({
  brand: { name: "Lantern Relay Systems", shortName: "Relay", mark: "LR", tagline: "Synthetic QA — coordinate lantern signals, cell supplies and the three-station route." },
  site: { url: "https://lantern-systems.example", locale: "en", timezone: "UTC" },
  seo: { defaultTitle: "Lantern Relay — Synthetic Systems QA", titleTemplate: "%s | Lantern Relay", defaultDescription: "Study three fictional relay systems and their tagged action guides, with a published deterministic editorial relevance method." },
  social: {}, navigation: { groups: [{ label: "Home", pageId: "home" }, { label: "Relay systems", pageId: "hub.guides", children: ["guide.light-system", "guide.supply-system", "guide.route-system", "guide.light-check", "guide.supply-check", "guide.route-check"] }, { label: "Method", pageId: "meta.relay-priorities" }] },
  homepage: { featuredPageIds: ["guide.light-system", "guide.supply-system", "guide.route-system"] },
  features: { guides: true, tierLists: true, heroes: false, weapons: false, items: false, maps: false, news: false, calculator: false, planner: false, search: false },
});
function page(overrides: Partial<PageInventoryEntry>): PageInventoryEntry {
  return { pageId: "home", route: "/", pageType: "home", cluster: "relay", module: "core", priority: 50, visibility: "public", publicationStatus: "published", contentStatus: "ready", developmentStatus: "ready", needsReview: true, needsUpdate: false, indexability: "index", title: "Lantern Relay Synthetic Systems", description: "Study the fictional relay systems, then choose a tagged action guide using the published editorial method and QA revision.", publishedAt: "2026-10-01", updatedAt: "2026-10-08", primaryKeyword: overrides.pageId ?? "relay systems", tags: ["relay"], relatedPageIds: ["home"], relatedEntityRefs: [], sources: [source], confidence: "high", ...overrides };
}
// Literal authored inputs: no new system entity type, registry or automatic ranking authority.
const inventory = parsePageInventory([
  page({ pageId: "home", description: disclosure, relatedPageIds: ["hub.guides", "meta.relay-priorities"] }),
  page({ pageId: "hub.guides", route: "/guides/", pageType: "hub", module: "guides", feature: "guides", title: "Lantern Relay Systems and Action Guides", description: "Browse the fictional light, supply and route systems, then open distinct tagged checks for the three-station QA relay.", relatedPageIds: ["guide.light-system", "guide.supply-system", "guide.route-system"] }),
  page({ pageId: "guide.light-system", route: "/guides/light-system/", pageType: "guide", module: "guides", feature: "guides", title: "How the Fictional Lantern Signal Works", description: "The Amber Lantern marks the next unlit station; coordinate this fictional signal with cell supply and the prescribed route.", tags: ["relay", "light"], contentRef: { collection: "guides", slug: "light-system" }, relatedPageIds: ["guide.light-check", "guide.route-check", "guide.supply-check"] }),
  page({ pageId: "guide.supply-system", route: "/guides/supply-system/", pageType: "guide", module: "guides", feature: "guides", title: "How Fictional Relay Cell Supply Works", description: "One cell powers one station in the synthetic relay; reserve three cells and coordinate stock with the light and route systems.", tags: ["relay", "supply"], contentRef: { collection: "guides", slug: "supply-system" }, relatedPageIds: ["guide.supply-check", "guide.light-check", "guide.route-check"] }),
  page({ pageId: "guide.route-system", route: "/guides/route-system/", pageType: "guide", module: "guides", feature: "guides", title: "How the Fictional East Circuit Works", description: "Follow Supply Dock, Signal Bridge and East Beacon in order; this fictional route coordinates light signals and cell consumption.", tags: ["relay", "route"], contentRef: { collection: "guides", slug: "route-system" }, relatedPageIds: ["guide.route-check", "guide.light-check", "guide.supply-check"] }),
  page({ pageId: "guide.light-check", route: "/guides/light-check/", pageType: "guide", module: "guides", feature: "guides", title: "Check the Next Fictional Unlit Station", description: "Read the Amber Lantern signal and confirm the next unlit station before spending a cell in the synthetic relay sequence.", tags: ["relay", "light"], contentRef: { collection: "guides", slug: "light-check" }, relatedPageIds: ["guide.light-system"] }),
  page({ pageId: "guide.supply-check", route: "/guides/supply-check/", pageType: "guide", module: "guides", feature: "guides", title: "Count Cells Before the Fictional Relay", description: "Count one cell for each remaining unlit station and recover a missing supply before continuing the fictional three-station task.", tags: ["relay", "supply"], contentRef: { collection: "guides", slug: "supply-check" }, relatedPageIds: ["guide.supply-system"] }),
  page({ pageId: "guide.route-check", route: "/guides/route-check/", pageType: "guide", module: "guides", feature: "guides", title: "Check the Fictional Three-Station Order", description: "Confirm Dock, Bridge and Beacon are visited in that order; return to the earliest unlit station if the synthetic route was skipped.", tags: ["relay", "route"], contentRef: { collection: "guides", slug: "route-check" }, relatedPageIds: ["guide.route-system"] }),
  page({ pageId: "meta.relay-priorities", route: "/meta/relay-priorities/", pageType: "meta", module: "tierLists", feature: "tierLists", title: "Editorial Relay Guide Relevance Method", description: "Inspect tag-overlap-v1 scores and tie-breaking for fictional relay guides; these authored relationships do not run an automatic ranking engine.", contentRef: { collection: "tierLists", slug: "relay-priorities" }, relatedPageIds: ["guide.light-system", "guide.supply-system", "guide.route-system"] }),
  page({ pageId: "about", route: "/about/", pageType: "about", title: "About the Fictional Relay Systems", description: "This synthetic systems fixture tests existing consumers and an editorial method, without claiming real-game identity or Human acceptance." }),
  page({ pageId: "not-found", route: "/404.html", pageType: "not-found", title: "Lantern Systems Page Not Found", description: "This address is outside the synthetic relay systems index; return to its guide hub or the published editorial method.", indexability: "noindex", relatedPageIds: ["home", "hub.guides"] }),
]);
const catalog = buildEnabledPageCatalog(config, inventory);
const manifest = { assets: [
  { id: "relay.system-map", type: "image", src: "/media/relay-system-map.svg", alt: "Lantern information, one-cell station supply and the Dock Bridge Beacon route form the fictional relay loop", dimensions: { width: 1200, height: 675 }, caption: "QA relay rules v1: light identifies the station, supply powers it, route orders the three stops. Original synthetic system map.", sourceUrl: source.sourceUrl, rightsRef: "fixture-authorship/relay-system-map.svg", credit: { text: "Project-authored synthetic systems diagram" } },
  { id: "relay.identity", type: "image", src: "/media/relay-identity.svg", alt: "Amber Lantern, Relay Cell and the three-station East Circuit identify the fictional Lantern Relay world", dimensions: { width: 1200, height: 630 }, caption: "Original Lantern Relay QA identity visual; not a real-game identity approval or gameplay image.", sourceUrl: source.sourceUrl, rightsRef: "fixture-authorship/relay-identity.svg", credit: { text: "Project-authored fictional QA identity visual" } },
], pages: [{ pageId: "home", hero: "relay.identity" }, { pageId: "guide.light-system", gallery: ["relay.system-map"] }], defaultShare: "relay.identity" };
const editorialLists = {
  "light-system": "1. [Light check](/guides/light-check/) — 2 shared tags.\n2. [Route check](/guides/route-check/) — 1 shared tags.\n3. [Supply check](/guides/supply-check/) — 1 shared tags.",
  "supply-system": "1. [Supply check](/guides/supply-check/) — 2 shared tags.\n2. [Light check](/guides/light-check/) — 1 shared tags.\n3. [Route check](/guides/route-check/) — 1 shared tags.",
  "route-system": "1. [Route check](/guides/route-check/) — 2 shared tags.\n2. [Light check](/guides/light-check/) — 1 shared tags.\n3. [Supply check](/guides/supply-check/) — 1 shared tags.",
};
const method = "tag-overlap-v1: count shared Inventory tags; sort by descending count, then ascending pageId for ties. QA relay rules v1. These are authored editorial relationships, not automatic runtime tag ranking.";
let fixtureRoot = "";
let previewPid: number | undefined;
let previewAttempted = false;
let buildLog = "";
const html = (route: string) => readFileSync(join(fixtureRoot, "dist", routeToOutputFile(route)), "utf8");
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));
function pidAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}
beforeAll(() => {
  fixtureRoot = createCoreBuildFixture("starter-reference-c-"); console.log(`REF-C fixture: ${fixtureRoot}`);
  writeFileSync(join(fixtureRoot, "game.config.ts"), `import { defineGameConfig } from "./src/config/schema";\nexport default defineGameConfig(${JSON.stringify(config, null, 2)});\n`);
  writeFileSync(join(fixtureRoot, "src/data/page-inventory.json"), JSON.stringify(inventory, null, 2));
  for (const directory of ["guides", "meta"]) { rmSync(join(fixtureRoot, "src/content", directory), { recursive: true }); mkdirSync(join(fixtureRoot, "src/content", directory)); }
  const systemBodies = {
    "light-system": "The Amber Lantern marks the next unlit station. Light is information, not power: consult the [supply system](/guides/supply-system/) for one cell and the [route system](/guides/route-system/) for the next allowed stop.\n\nSystem tags: relay, light.",
    "supply-system": "A Relay Cell powers exactly one station and is consumed. Reserve three cells before the circuit; consult the [light system](/guides/light-system/) to identify the station and the [route system](/guides/route-system/) to avoid skipping it.\n\nSystem tags: relay, supply.",
    "route-system": "Supply Dock, Signal Bridge, then East Beacon is the fixed order. Coordinate the [light system](/guides/light-system/) signal with the [supply system](/guides/supply-system/) cell count. All three lit stations complete the route.\n\nSystem tags: relay, route.",
  };
  for (const slug of ["light-system", "supply-system", "route-system"] as const) {
    writeFileSync(join(fixtureRoot, `src/content/guides/${slug}.mdx`), `---\npageId: guide.${slug}\n---\n\n${disclosure}\n\n## Understand this system\n\n${systemBodies[slug]}\n\n## Choose a relevant action\n\n${method}\n\nGuide tags: light-check=(relay, light); supply-check=(relay, supply); route-check=(relay, route).\n\n${editorialLists[slug]}\n`);
  }
  const actionBodies = {
    "light-check": "Read the Amber Lantern marker and confirm the indicated station is unlit. If it is already lit, consult the route before spending a cell. Finish when the next unlit station is correctly identified.",
    "supply-check": "Count one Relay Cell for each remaining unlit station. Three unlit stations need three cells. If stock is short, replenish it before continuing; finish when stock covers every remaining stop.",
    "route-check": "Check Supply Dock, Signal Bridge, then East Beacon in order. If a stop was skipped, return to the earliest unlit one. Finish when all three stations are lit in the prescribed sequence.",
  };
  for (const slug of ["light-check", "supply-check", "route-check"] as const) {
    writeFileSync(join(fixtureRoot, `src/content/guides/${slug}.mdx`), `---\npageId: guide.${slug}\n---\n\n${disclosure}\n\n## Perform the check\n\n${actionBodies[slug]}\n\n## Record the QA context\n\nQA relay rules v1; synthetic source access 2026-10-07. [Read the editorial relevance method](/meta/relay-priorities/).\n`);
  }
  writeFileSync(join(fixtureRoot, "src/content/meta/relay-priorities.mdx"), `---\npageId: meta.relay-priorities\n---\n\n${disclosure}\n\n## Published method and version\n\n${method}\n\nAll systems and candidates share relay. Each system's second tag is light, supply or route; its matching action has that same second tag.\n\n## Light system ranking\n\n${editorialLists["light-system"]}\n\n## Supply system ranking\n\n${editorialLists["supply-system"]}\n\n## Route system ranking\n\n${editorialLists["route-system"]}\n\nThe editor records these ordered relatedPageIds in Inventory. Existing RelatedPages consumes that order; it does not compute tag scores.\n`);
  rmSync(join(fixtureRoot, "public/media/qa-default-share.svg")); rmSync(join(fixtureRoot, "public/logo.svg"));
  for (const name of ["relay-system-map.svg", "relay-identity.svg"]) cpSync(resolve("tests/fixtures/reference-media", name), join(fixtureRoot, "public/media", name));
  writeFileSync(join(fixtureRoot, "src/data/media/media.json"), JSON.stringify(manifest, null, 2)); mkdirSync(join(fixtureRoot, "docs"));
  const headings = "pageId_or_route | page_family | media_need | need_rationale | intended_placement | candidate_state | rights_state | human_decision | integration_state | visual_gate_state | source_or_provenance | owner_or_defer_reason | notes";
  const rows = catalog.map(entry => {
    const media = ["home", "guide.light-system"].includes(entry.pageId);
    return [entry.pageId, entry.pageType, media ? "HIGH PRIORITY" : "NO MEDIA NEEDED", media ? "The original QA identity or version-labelled system map explains the fixture's concrete objects and loop." : "MC-04: text, recorded tags and ordered links completely express this task; no visible media required.", media ? (entry.pageId === "home" ? "hero" : "gallery") : "none", media ? "FOUND" : "NOT FOUND", media ? "VERIFIED" : "NOT REQUIRED FOR EMBED", "PENDING", media ? "INTEGRATED" : "NOT INTEGRATED", "PENDING", "Original fixture-authored QA world and SVG primitives, not external game imagery.", "Human identity and visual review not performed.", "Synthetic technical evidence only; no real-game GI approval."].join(" | ");
  });
  writeFileSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), `# Synthetic REF-C media decisions\n\n| ${headings} |\n| ${headings.split(" | ").map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row} |`).join("\n")}\n`);
  const validation = runFixtureNpm(fixtureRoot, "validate"); const validationLog = `${validation.stdout}\n${validation.stderr}`;
  console.log(`REF-C validate exit=${validation.status}\n${validationLog}`);
  expect(validation.error).toBeUndefined(); expect(validation.status).toBe(1);
  expect(validationLog.split("\n").filter(line => line.startsWith("- "))).toEqual(["- Media readiness home (/) is HIGH PRIORITY and pending; unresolved media is not resolved by Starter projection.", "- Media readiness guide.light-system (/guides/light-system/) is HIGH PRIORITY and pending; unresolved media is not resolved by Starter projection."]);
  const build = runFixtureNpm(fixtureRoot, "build:evidence"); buildLog = `${build.stdout}\n${build.stderr}`;
  console.log(`REF-C build:evidence exit=${build.status}\n${buildLog}`); expect(build.error).toBeUndefined(); expect(build.status).toBe(0);
  const directory = process.env.V27_REF_C_EVIDENCE_DIR;
  if (directory) {
    const destination = realpathSync(directory); if (!relative(process.cwd(), destination).startsWith("../")) throw new Error("Evidence must be outside source project.");
    cpSync(join(fixtureRoot, "dist"), join(destination, "generated-output"), { recursive: true, errorOnExist: true, force: false });
    cpSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), join(destination, "fixture-media-decisions.md"), { errorOnExist: true, force: false });
    cpSync(join(fixtureRoot, "src/data/page-inventory.json"), join(destination, "actual-fixture-inventory.json"), { errorOnExist: true, force: false });
  }
}, 120_000);
afterAll(async () => {
  let cleanupError: unknown;
  try {
    if (previewAttempted) {
      const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixtureRoot, encoding: "utf8", timeout: 15_000 });
      console.log(`REF-C preview stop exit=${stopped.status}\n${stopped.stdout}\n${stopped.stderr}`);
      expect(stopped.error).toBeUndefined(); expect(stopped.status).toBe(0); expect(previewPid).toBeDefined();
      for (let retry = 0; previewPid && pidAlive(previewPid) && retry < 30; retry++) await pause(100);
      expect(pidAlive(previewPid!)).toBe(false); console.log(`REF-C owned preview PID ${previewPid} stopped normally.`);
    }
  } catch (error) {
    cleanupError = error;
    if (previewPid && pidAlive(previewPid)) { process.kill(previewPid, "SIGTERM"); for (let retry = 0; pidAlive(previewPid) && retry < 30; retry++) await pause(100); if (pidAlive(previewPid)) process.kill(previewPid, "SIGKILL"); console.error("REF-C cleanup FAILED: owned fallback termination."); }
  } finally {
    if (fixtureRoot) { cleanupCoreBuildFixture(fixtureRoot); expect(existsSync(fixtureRoot)).toBe(false); console.log("REF-C temporary fixture removed."); }
  }
  if (cleanupError) throw cleanupError;
}, 30_000);

describe("REF-C existing systems and authored editorial relationships", () => {
  it("independently derives shared-tag rankings from actual Inventory and compares published output", () => {
    const actual = parsePageInventory(JSON.parse(readFileSync(join(fixtureRoot, "src/data/page-inventory.json"), "utf8")));
    const actions = actual.filter(entry => entry.pageId.endsWith("-check")); expect(actions).toHaveLength(3);
    const systems = actual.filter(entry => entry.pageId.endsWith("-system")); expect(systems).toHaveLength(3);
    const ranking = html("/meta/relay-priorities/"); expect(ranking).toContain(method);
    const publishedLists = [...ranking.matchAll(/<ol>([\s\S]*?)<\/ol>/g)].map(match => match[1])
      .filter(list => list.includes("shared tags")); expect(publishedLists).toHaveLength(3);
    for (const [index, system] of systems.entries()) {
      const scored = actions.map(action => ({ action, score: action.tags.filter(tag => system.tags.includes(tag)).length }))
        .sort((left, right) => right.score - left.score || left.action.pageId.localeCompare(right.action.pageId, "en"));
      expect(system.relatedPageIds).toEqual(scored.map(entry => entry.action.pageId));
      const output = html(system.route); expect(output).toContain(method);
      const related = output.match(/<nav[^>]*aria-label="Related pages"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
      expect([...related.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual(scored.map(entry => entry.action.route));
      for (const published of [output, publishedLists[index]]) {
        const rows = [...published.matchAll(/href="([^"]+)"[^>]*>[^<]+<\/a>\s*—\s*(\d+) shared tags/g)].map(match => ({ route: match[1], score: Number(match[2]) }));
        expect(rows).toEqual(scored.map(entry => ({ route: entry.action.route, score: entry.score })));
      }
      for (const other of systems.filter(entry => entry.pageId !== system.pageId)) expect(output).toContain(`href="${other.route}"`);
      console.log(`REF-C independent editorial ranking PASS ${system.pageId}: ${JSON.stringify(scored.map(entry => ({ pageId: entry.action.pageId, score: entry.score })))}`);
    }
    expect(ranking).toContain("does not compute tag scores");
  });

  it("renders distinct tasks, original versioned media and the exact existing catalog", () => {
    expect(catalog).toHaveLength(11); expect(collectOutputReconciliationErrors(catalog, join(fixtureRoot, "dist"))).toEqual([]);
    expect(buildLog).toContain("Generated build audit passed for 11 pages.");
    const ids = new Set(catalog.map(entry => entry.pageId));
    for (const entry of catalog) {
      for (const id of entry.relatedPageIds) expect(ids.has(id)).toBe(true);
      const output = html(entry.route); expect(output).toContain(`rel="canonical" href="${new URL(entry.route, config.site.url).href}"`);
      expect(output).not.toMatch(/Game Atlas|gameatlas\.example|@gameatlas|liveStatus|observed-live|not-live|fixture-authorship|evidenceNote/);
      expect(output).not.toContain(source.evidenceNote); console.log(`REF-C generated route PASS ${entry.route}`);
    }
    const media = createMediaCatalog(manifest, [...ids], src => existsSync(join(fixtureRoot, "public", src)));
    expect(media.getPageMedia("home").heroMedia?.id).toBe("relay.identity"); expect(media.getPageMedia("guide.light-system").galleryMedia[0].id).toBe("relay.system-map");
    expect(html("/")).toContain(disclosure); expect(html("/")).toContain('src="/media/relay-identity.svg"');
    expect(html("/guides/light-system/")).toContain('src="/media/relay-system-map.svg"');
    expect(html("/guides/light-system/")).toContain(manifest.assets[0].caption);
    expect(html("/guides/light-check/")).toContain("next unlit station is correctly identified");
    expect(html("/guides/supply-check/")).toContain("stock covers every remaining stop");
    expect(html("/guides/route-check/")).toContain("all three stations are lit in the prescribed sequence");
    expect(readFileSync(join(fixtureRoot, "dist/media/relay-system-map.svg"), "utf8")).toContain("QA relay rules v1");
    expect(readFileSync(join(fixtureRoot, "dist/media/relay-system-map.svg"), "utf8")).not.toBe(readFileSync(join(fixtureRoot, "dist/media/relay-identity.svg"), "utf8"));
    expect(JSON.parse(readFileSync(join(fixtureRoot, "dist/EVIDENCE_BUILD_NOT_FINAL.json"), "utf8"))).toMatchObject({ mode: "evidence", final: false });
  });

  it("observes existing nested mobile Escape and focus restoration without changing navigation", async () => {
    const port = await new Promise<number>((resolvePort, reject) => {
      const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); if (!address || typeof address === "string") { server.close(); reject(new Error("No reserved port")); return; } server.close(error => error ? reject(error) : resolvePort(address.port)); });
    });
    previewAttempted = true;
    const started = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixtureRoot, encoding: "utf8", timeout: 30_000 });
    previewPid = Number(started.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined; console.log(`REF-C preview start exit=${started.status}\n${started.stdout}\n${started.stderr}`);
    expect(started.error).toBeUndefined(); expect(started.status).toBe(0); expect(previewPid).toBeDefined(); const base = `http://127.0.0.1:${port}`; expect(started.stdout).toContain(base);
    const browser = await chromium.launch({ headless: true });
    try {
      console.log(`REF-C Chromium ${browser.version()}, Playwright1.63.0; limited mobile navigation observation.`);
      for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 960 }]) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        try {
          const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
          expect((await page.goto(`${base}/guides/light-system/`, { waitUntil: "networkidle", timeout: 15_000 }))?.status()).toBe(200);
          const root = page.locator("details.mobile-nav"); const rootSummary = page.locator("details.mobile-nav > summary");
          const group = page.locator("details.mobile-nav__group"); const groupSummary = page.locator("details.mobile-nav__group > summary");
          await rootSummary.click(); await groupSummary.click(); await page.keyboard.press("Tab");
          expect(await page.locator('a.mobile-nav__overview[data-nav-page-id="hub.guides"]').evaluate(node => document.activeElement === node)).toBe(true);
          await page.keyboard.press("Escape"); expect(await group.getAttribute("open")).toBeNull(); expect(await root.getAttribute("open")).not.toBeNull();
          expect(await groupSummary.evaluate(node => document.activeElement === node)).toBe(true);
          await page.keyboard.press("Escape"); expect(await root.getAttribute("open")).toBeNull(); expect(await rootSummary.evaluate(node => document.activeElement === node)).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
          expect(await page.locator('img[src="/media/relay-system-map.svg"]').evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth === 1200)).toBe(true);
          expect(errors).toEqual([]); console.log(`REF-C ${viewport.width}x${viewport.height} PASS: nestedTab overview; Escape closesgroup/restoresgroupsummary; secondEscape closesroot/restoresMenu; no horizontal overflow; systemdiagram loaded; JS errors0.`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
    expect((await fetch(`${base}/missing-system/`, { signal: AbortSignal.timeout(3000) })).status).toBe(404);
    console.log("REF-C real HTTP404; authored editorial method only, no automatic ranking. Human game-identity/visual and fullbrowser/Safari/AX/REF-C/WS06B/PRODUCT/RELEASE remain unaccepted.");
  }, 60_000);
});
