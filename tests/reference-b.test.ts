import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import { buildEnabledPageCatalog } from "../src/core/catalog";
import { collectOutputReconciliationErrors, routeToOutputFile } from "../src/core/output-reconciliation";
import { evaluateCalculator, normalizeCalculatorInputs } from "../src/core/tool-definitions";
import { loadToolDefinition } from "../src/core/tool-loader";
import { createMediaCatalog } from "../src/data/media/catalog";
import { parsePageInventory, type PageInventoryEntry } from "../src/data/schemas/page-inventory";
import { calculatorDefinitionSchema } from "../src/data/schemas/tools";
import { cleanupCoreBuildFixture, createCoreBuildFixture, runFixtureNpm } from "./helpers/core-build-fixture";

const disclosure = "Fictional QA scenario for Starter regression testing; not a real commercial game.";
const source = { sourceUrl: "https://lantern-budget.example/guides/check-budget/", sourceType: "editorial" as const, accessedAt: "2026-10-07", evidenceNote: "Fixture-authored fictional budget rule; synthetic QA dates and values, not a verified real-game economy." };
const definition = calculatorDefinitionSchema.parse({
  id: "relay-budget", kind: "calculator", name: "Lantern Relay Synthetic Budget",
  description: "Calculate the fictional budget for a chosen number of Amber Lanterns using deterministic QA inputs.",
  patch: "QA relay rules v1", updatedAt: "2026-10-08", confidence: "high", sources: [source],
  resultLabel: "Fictional total", resultUnit: "QA units", precision: 0,
  inputs: [
    { id: "quantity", label: "Lantern quantity", min: 1, max: 10, step: 1, defaultValue: 3 },
    { id: "unit-value", label: "Fictional unit value", min: 1, max: 20, step: 1, defaultValue: 4 },
  ],
  formula: { kind: "multiply", operands: [{ kind: "input", inputId: "quantity" }, { kind: "input", inputId: "unit-value" }] },
});
const config = defineGameConfig({
  brand: { name: "Lantern Relay Budget", shortName: "Relay", mark: "LR", tagline: "Synthetic QA — calculate a lantern budget before choosing a quantity." },
  site: { url: "https://lantern-budget.example", locale: "en", timezone: "UTC" },
  seo: { defaultTitle: "Lantern Relay — Synthetic Budget QA", titleTemplate: "%s | Lantern Relay", defaultDescription: "Work through a fictional lantern-budget task, compare quantity assumptions and calculate a deterministic synthetic QA total." },
  social: {}, navigation: { groups: [{ label: "Home", pageId: "home" }, { label: "Budget guides", pageId: "hub.guides", children: ["guide.relay-budget", "guide.check-budget"] }, { label: "Calculator", pageId: "tool.relay-budget" }] },
  homepage: { featuredPageIds: ["guide.relay-budget", "tool.relay-budget"] },
  features: { guides: true, calculator: true, planner: false, heroes: false, weapons: false, items: false, maps: false, tierLists: false, news: false, search: false },
});
function page(overrides: Partial<PageInventoryEntry>): PageInventoryEntry {
  return { pageId: "home", route: "/", pageType: "home", cluster: "budget", module: "core", priority: 50, visibility: "public", publicationStatus: "published", contentStatus: "ready", developmentStatus: "ready", needsReview: true, needsUpdate: false, indexability: "index", title: "Lantern Relay Budget QA Reference", description: "Read the fictional lantern budget assumptions and calculate a synthetic total before choosing how many lanterns to carry.", publishedAt: "2026-10-01", updatedAt: "2026-10-08", primaryKeyword: overrides.pageId ?? "relay budget home", tags: ["synthetic", "budget"], relatedPageIds: ["home"], relatedEntityRefs: [], sources: [source], confidence: "high", ...overrides };
}
const inventory = parsePageInventory([
  page({ pageId: "home", description: disclosure, relatedPageIds: ["hub.guides", "guide.relay-budget", "tool.relay-budget"] }),
  page({ pageId: "hub.guides", route: "/guides/", pageType: "hub", module: "guides", feature: "guides", title: "Lantern Budget Guides and Checks", description: "Choose the fictional lantern-budget walkthrough or the final assumptions check before recording a synthetic QA decision.", relatedPageIds: ["guide.relay-budget", "guide.check-budget"] }),
  page({ pageId: "guide.relay-budget", route: "/guides/relay-budget/", pageType: "guide", module: "guides", feature: "guides", priority: 90, title: "How Much for Three Fictional Lanterns?", description: "Three Amber Lanterns at four fictional units each cost twelve QA units; compare quantity choices and use the existing calculator.", contentRef: { collection: "guides", slug: "relay-budget" }, relatedPageIds: ["tool.relay-budget", "guide.check-budget"] }),
  page({ pageId: "tool.relay-budget", route: "/tools/relay-budget/", pageType: "calculator", module: "tools", feature: "calculator", title: "Fictional Lantern Budget Calculator", description: "Multiply lantern quantity by a fictional unit value, test bounds, and return to the guide to check your synthetic budget assumptions.", relatedPageIds: ["guide.relay-budget", "guide.check-budget"] }),
  page({ pageId: "guide.check-budget", route: "/guides/check-budget/", pageType: "guide", module: "guides", feature: "guides", title: "Check Your Fictional Budget Assumptions", description: "Confirm quantity, unit value and the QA revision after calculating; this text-only checklist does not claim real-game pricing.", contentRef: { collection: "guides", slug: "check-budget" }, relatedPageIds: ["guide.relay-budget", "tool.relay-budget"] }),
  page({ pageId: "about", route: "/about/", pageType: "about", title: "About the Synthetic Lantern Budget", description: "This fictional budget fixture tests existing guide and calculator consumers; its sample numbers are not a real game economy." }),
  page({ pageId: "not-found", route: "/404.html", pageType: "not-found", title: "Lantern Budget Page Not Found", description: "This address is outside the synthetic budget reference; recover by opening its guide index or the fictional budget calculator.", indexability: "noindex", relatedPageIds: ["home", "hub.guides"] }),
]);
const catalog = buildEnabledPageCatalog(config, inventory);
const manifest = { assets: [{ id: "budget.figure", type: "image", src: "/media/budget-figure.svg", alt: "Three fictional lanterns at four QA units each total twelve, while five lanterns total twenty", dimensions: { width: 1200, height: 675 }, caption: "Quantity multiplied by unit value: 3 × 4 = 12; 5 × 4 = 20. Original synthetic QA diagram, not real-game prices.", sourceUrl: source.sourceUrl, rightsRef: "fixture-authorship/budget-figure.svg", credit: { text: "Project-authored synthetic budget diagram" } }], pages: [{ pageId: "guide.relay-budget", gallery: ["budget.figure"] }], defaultShare: "budget.figure" };
let fixtureRoot = "";
let buildLog = "";
let previewPid: number | undefined;
let previewAttempted = false;
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));
const html = (route: string) => readFileSync(join(fixtureRoot, "dist", routeToOutputFile(route)), "utf8");
function pidAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

beforeAll(() => {
  fixtureRoot = createCoreBuildFixture("starter-reference-b-");
  console.log(`REF-B fixture: ${fixtureRoot}`);
  writeFileSync(join(fixtureRoot, "game.config.ts"), `import { defineGameConfig } from "./src/config/schema";\nexport default defineGameConfig(${JSON.stringify(config, null, 2)});\n`);
  writeFileSync(join(fixtureRoot, "src/data/page-inventory.json"), JSON.stringify(inventory, null, 2));
  writeFileSync(join(fixtureRoot, "src/data/tools/relay-budget.json"), JSON.stringify(definition, null, 2));
  rmSync(join(fixtureRoot, "src/content/guides"), { recursive: true });
  mkdirSync(join(fixtureRoot, "src/content/guides"));
  writeFileSync(join(fixtureRoot, "src/content/guides/relay-budget.mdx"), `---
pageId: guide.relay-budget
---

${disclosure}

Three Amber Lanterns at four fictional units each cost twelve QA units. This is a quantity decision under QA relay rules v1, not a market-price claim.

## Choose the quantity

1. Decide how many lanterns you need, from one to ten.
2. Keep the fictional unit value at four to compare the two options.
3. [Open the fictional calculator](/tools/relay-budget/) and multiply quantity by unit value.

## Compare the assumptions

Three lanterns cost 12 QA units. Five lanterns cost 20 QA units. The extra two lanterns add 8 units at the same unit value; this comparison excludes Relay Cells and other supplies.

## Recover and finish

An empty quantity resets to the default three. A quantity above ten clamps to ten; correct it before deciding. Blank unit value resets to four. These are the existing calculator normalization rules.

Completion means your displayed total matches your chosen quantity times the fictional unit value and both inputs match your assumptions. The result does not prove that a real game has these prices.

Next, [check your budget assumptions](/guides/check-budget/) and record the QA revision.

Video is deliberately excluded: this short static multiplication and comparison are fully explained by text and the original figure; no animation is required.
`);
  writeFileSync(join(fixtureRoot, "src/content/guides/check-budget.mdx"), `---
pageId: guide.check-budget
---

${disclosure}

## Confirm the two inputs

Read back quantity and fictional unit value. Three multiplied by four must be twelve; five multiplied by four must be twenty.

## Record the revision

Record QA relay rules v1 and the synthetic source-access date 2026-10-07. These fixture-authored values were not externally verified against a real game. The text-only checklist needs no image or video.

If the assumptions differ, [return to the calculator](/tools/relay-budget/) or [reread the walkthrough](/guides/relay-budget/).
`);
  rmSync(join(fixtureRoot, "public/media/qa-default-share.svg"));
  rmSync(join(fixtureRoot, "public/logo.svg"));
  cpSync(resolve("tests/fixtures/reference-media/budget-figure.svg"), join(fixtureRoot, "public/media/budget-figure.svg"));
  writeFileSync(join(fixtureRoot, "src/data/media/media.json"), JSON.stringify(manifest, null, 2));
  mkdirSync(join(fixtureRoot, "docs"));
  const headings = "pageId_or_route | page_family | media_need | need_rationale | intended_placement | candidate_state | rights_state | human_decision | integration_state | visual_gate_state | source_or_provenance | owner_or_defer_reason | notes";
  const rows = catalog.map(entry => {
    const withFigure = entry.pageId === "guide.relay-budget";
    return [entry.pageId, entry.pageType, withFigure ? "HIGH PRIORITY" : "NO MEDIA NEEDED", withFigure ? "The original static diagram explains multiplication and quantity comparison; video adds no explanatory value." : "MC-04: task is fully answered by text or the numeric interface; no visible media is needed.", withFigure ? "gallery" : "none", withFigure ? "FOUND" : "NOT FOUND", withFigure ? "VERIFIED" : "NOT REQUIRED FOR EMBED", "PENDING", withFigure ? "INTEGRATED" : "NOT INTEGRATED", "PENDING", "Original fixture-authored QA rules and SVG primitives; no external gameplay art.", "Independent Human and visual review not performed.", "Synthetic budget evidence; video excluded, not rights waived."].join(" | ");
  });
  writeFileSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), `# Synthetic REF-B media decisions\n\n| ${headings} |\n| ${headings.split(" | ").map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row} |`).join("\n")}\n`);
  const validation = runFixtureNpm(fixtureRoot, "validate");
  const validationLog = `${validation.stdout}\n${validation.stderr}`;
  console.log(`REF-B validate exit=${validation.status}\n${validationLog}`);
  expect(validation.error).toBeUndefined();
  expect(validation.status).toBe(1);
  expect(validationLog.split("\n").filter(line => line.startsWith("- "))).toEqual(["- Media readiness guide.relay-budget (/guides/relay-budget/) is HIGH PRIORITY and pending; unresolved media is not resolved by Starter projection."]);
  const build = runFixtureNpm(fixtureRoot, "build:evidence");
  buildLog = `${build.stdout}\n${build.stderr}`;
  console.log(`REF-B build:evidence exit=${build.status}\n${buildLog}`);
  expect(build.error).toBeUndefined();
  expect(build.status).toBe(0);
  const directory = process.env.V27_REF_B_EVIDENCE_DIR;
  if (directory) {
    const destination = realpathSync(directory);
    if (!relative(process.cwd(), destination).startsWith("../")) throw new Error("Evidence output must be outside the project.");
    cpSync(join(fixtureRoot, "dist"), join(destination, "generated-output"), { recursive: true, errorOnExist: true, force: false });
    cpSync(join(fixtureRoot, "docs/MEDIA_DECISION_TABLE.md"), join(destination, "fixture-media-decisions.md"), { errorOnExist: true, force: false });
  }
}, 120_000);

afterAll(async () => {
  let cleanupError: unknown;
  try {
    if (previewAttempted) {
      const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixtureRoot, encoding: "utf8", timeout: 15_000 });
      console.log(`REF-B preview stop exit=${stopped.status}\n${stopped.stdout}\n${stopped.stderr}`);
      expect(stopped.error).toBeUndefined(); expect(stopped.status).toBe(0); expect(previewPid).toBeDefined();
      for (let retry = 0; previewPid && pidAlive(previewPid) && retry < 30; retry++) await pause(100);
      expect(pidAlive(previewPid!)).toBe(false);
      console.log(`REF-B owned preview PID ${previewPid} stopped normally.`);
    }
  } catch (error) {
    cleanupError = error;
    if (previewPid && pidAlive(previewPid)) {
      process.kill(previewPid, "SIGTERM");
      for (let retry = 0; pidAlive(previewPid) && retry < 30; retry++) await pause(100);
      if (pidAlive(previewPid)) process.kill(previewPid, "SIGKILL");
      console.error("REF-B cleanup FAILED; owned preview required fallback termination.");
    }
  } finally {
    if (fixtureRoot) { cleanupCoreBuildFixture(fixtureRoot); expect(existsSync(fixtureRoot)).toBe(false); console.log("REF-B temporary fixture removed."); }
  }
  if (cleanupError) throw cleanupError;
}, 30_000);

describe("REF-B existing guide/tool consumer technical fixture", () => {
  it("uses real schemas, loader and evaluator for valid/invalid/non-finite states", () => {
    expect(loadToolDefinition("relay-budget", "calculator", fixtureRoot)).toEqual(definition);
    expect(evaluateCalculator(definition, { quantity: 3, "unit-value": 4 })).toBe(12);
    expect(evaluateCalculator(definition, { quantity: 5, "unit-value": 4 })).toBe(20);
    expect(normalizeCalculatorInputs(definition, { quantity: 999, "unit-value": 4 }).quantity).toBe(10);
    expect(evaluateCalculator(definition, { quantity: 999, "unit-value": 4 })).toBe(40);
    expect(evaluateCalculator(definition, { quantity: Number.NaN, "unit-value": 4 })).toBe(12);
    expect(evaluateCalculator(definition, { quantity: 3, "unit-value": Number.POSITIVE_INFINITY })).toBe(12);
    expect(() => calculatorDefinitionSchema.parse({ ...definition, formula: { kind: "input", inputId: "unknown-input" } })).toThrow(/unknown input/);
    const ids = new Set(catalog.map(entry => entry.pageId));
    for (const entry of catalog) for (const id of entry.relatedPageIds) expect(ids.has(id)).toBe(true);
    expect(createMediaCatalog(manifest, [...ids], src => existsSync(join(fixtureRoot, "public", src))).getPageMedia("guide.relay-budget").galleryMedia).toHaveLength(1);
  });

  it("renders the task, comparison/recovery/next action and original figure without new modules", () => {
    const guide = html("/guides/relay-budget/");
    for (const text of [disclosure, "cost twelve QA units", "extra two lanterns add 8", "excludes Relay Cells", "An empty quantity resets", "Completion means", "Video is deliberately excluded"]) expect(guide).toContain(text);
    expect(guide).toMatch(/<ol>\s*<li>Decide how many/);
    expect(guide).toContain('href="/tools/relay-budget/"'); expect(guide).toContain('href="/guides/check-budget/"');
    expect(guide).toContain('src="/media/budget-figure.svg"'); expect(guide).toContain(manifest.assets[0].alt);
    expect(guide).toContain(manifest.assets[0].caption); expect(guide).toContain(manifest.assets[0].credit.text);
    expect(guide).not.toMatch(/<iframe|<video/);
    expect(html("/guides/check-budget/")).not.toContain("data-media-placement");
    expect(html("/tools/relay-budget/")).toContain('data-tool-id="relay-budget"');
    expect(html("/tools/relay-budget/")).toContain("QA relay rules v1");
  });

  it("preserves actual routes, evidence marker and existing metadata/residue protections", () => {
    expect(catalog).toHaveLength(7);
    expect(collectOutputReconciliationErrors(catalog, join(fixtureRoot, "dist"))).toEqual([]);
    expect(buildLog).toContain("Generated build audit passed for 7 pages.");
    for (const entry of catalog) {
      const output = html(entry.route);
      expect(output).toContain(`rel="canonical" href="${new URL(entry.route, config.site.url).href}"`);
      expect(output).not.toMatch(/Game Atlas|gameatlas\.example|@gameatlas|liveStatus|observed-live|not-live|fixture-authorship|evidenceNote/);
      expect(output).not.toContain(source.evidenceNote);
      console.log(`REF-B generated route PASS ${entry.route}`);
    }
    expect(JSON.parse(readFileSync(join(fixtureRoot, "dist/EVIDENCE_BUILD_NOT_FINAL.json"), "utf8"))).toMatchObject({ mode: "evidence", final: false });
  });

  it("observes hydrated calculator states and the complete manual task journey in Chromium", async () => {
    const port = await new Promise<number>((resolvePort, reject) => {
      const server = createServer(); server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") { server.close(); reject(new Error("No reserved port")); return; }
        server.close(error => error ? reject(error) : resolvePort(address.port));
      });
    });
    previewAttempted = true;
    const started = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixtureRoot, encoding: "utf8", timeout: 30_000 });
    previewPid = Number(started.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined;
    console.log(`REF-B preview start exit=${started.status}\n${started.stdout}\n${started.stderr}`);
    expect(started.error).toBeUndefined(); expect(started.status).toBe(0); expect(previewPid).toBeDefined();
    const base = `http://127.0.0.1:${port}`; expect(started.stdout).toContain(base);
    const browser = await chromium.launch({ headless: true });
    try {
      console.log(`REF-B browser Chromium ${browser.version()}, Playwright1.63.0; synthetic task only.`);
      for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
          expect((await page.goto(`${base}/guides/relay-budget/`, { waitUntil: "networkidle", timeout: 15_000 }))?.status()).toBe(200);
          const figure = page.locator('img[src="/media/budget-figure.svg"]');
          expect(await figure.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth === 1200)).toBe(true);
          const bounds = await figure.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
          await page.locator('.prose a[href="/tools/relay-budget/"]').click();
          await page.waitForURL(`${base}/tools/relay-budget/`);
          await page.locator("astro-island:not([ssr])").waitFor({ state: "attached", timeout: 10_000 });
          const quantity = page.getByLabel("Lantern quantity", { exact: true });
          const unitValue = page.getByLabel("Fictional unit value", { exact: true });
          const result = page.locator("output.calculator__result strong");
          expect(await quantity.inputValue()).toBe("3"); expect((await result.innerText()).trim()).toBe("12 QA units");
          await quantity.fill("5"); expect(await quantity.inputValue()).toBe("5"); expect((await result.innerText()).trim()).toBe("20 QA units");
          await quantity.fill("999"); expect(await quantity.inputValue()).toBe("10"); expect((await result.innerText()).trim()).toBe("40 QA units");
          await quantity.fill(""); expect(await quantity.inputValue()).toBe("3"); expect((await result.innerText()).trim()).toBe("12 QA units");
          await unitValue.fill(""); expect(await unitValue.inputValue()).toBe("4"); expect((await result.innerText()).trim()).toBe("12 QA units");
          await quantity.click(); await page.keyboard.press("Tab");
          expect(await unitValue.evaluate(node => document.activeElement === node)).toBe(true);
          await page.keyboard.press("Shift+Tab"); expect(await quantity.evaluate(node => document.activeElement === node)).toBe(true);
          await page.keyboard.press("ArrowUp"); expect(await quantity.inputValue()).toBe("4"); expect((await result.innerText()).trim()).toBe("16 QA units");
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
          await page.locator('nav[aria-label="Related pages"] a[href="/guides/relay-budget/"]').click();
          await page.waitForURL(`${base}/guides/relay-budget/`);
          await page.locator('.prose a[href="/guides/check-budget/"]').click();
          await page.waitForURL(`${base}/guides/check-budget/`);
          expect(await page.locator("body").innerText()).toContain("Record QA relay rules v1");
          expect(pageErrors).toEqual([]);
          console.log(`REF-B browser ${viewport.width}x${viewport.height} PASS: actual guide->tool->result->guide->manual-next; hydrated3x4=12,5x4=20,999->10/40,emptyquantity->3/12,emptyunit->4/12; Tab/ShiftTab/ArrowUp4/16; no document overflow; figure loaded/fits; JS errors0.`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
    const missing = await fetch(`${base}/missing-budget/`, { signal: AbortSignal.timeout(3000) });
    expect(missing.status).toBe(404); expect(await missing.text()).toContain("Lantern Budget Page Not Found");
    console.log("REF-B real HTTP missing route404; Human/title/media/full-browser/Safari/AX/WS06B/PRODUCT/RELEASE not accepted; no screenshot capture.");
  }, 60_000);
});
