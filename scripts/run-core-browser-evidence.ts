import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type Browser, type Locator, type Page } from "playwright";
import { cleanupCoreBuildFixture, createFullProjectFixture } from "../tests/helpers/core-build-fixture";
import { assertVerificationResult } from "./verify-adoption";
import { browserEngines, coreBrowserMatrix, validateMatrix, type BrowserCase, type BrowserEngine } from "./core-browser-matrix";
import { canonicalContractReference, resolveContractBinding, validateBrowserEvidence, type CoreBrowserEvidence, type EvidenceIdentity, type BrowserEvidenceRow } from "./core-browser-evidence";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const excluded = new Set([".git", "node_modules", "dist", ".astro", ".astro-cache", ".vite-cache", ".vitest-cache", ".wrangler", "coverage", ".browser-evidence", ".DS_Store"]);

function manifest(root: string): string {
  const files: Array<{ path: string; sha256: string; mode: number; symlink: boolean }> = [];
  function visit(directory: string) {
    for (const name of readdirSync(directory).sort()) {
      if (excluded.has(name) || name.startsWith(".env")) continue;
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path);
      else files.push({ path: relative(root, path), sha256: sha256(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)), mode: stat.mode & 0o777, symlink: stat.isSymbolicLink() });
    }
  }
  visit(root);
  return sha256(JSON.stringify(files));
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`Cannot bind git identity: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("No preview port")); return; }
      server.close((error) => error ? reject(error) : accept(address.port));
    });
  });
}

const delay = (ms: number) => new Promise((accept) => setTimeout(accept, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function requireCondition(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitPidGone(pid: number): Promise<boolean> {
  for (let retry = 0; retry < 30; retry++) {
    if (!pidAlive(pid)) return true;
    await delay(100);
  }
  return !pidAlive(pid);
}

async function nativeKeyboardProbe(browser: Browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); await page.bringToFront();
    await page.setContent('<a href="#x">link</a><button>button</button><input aria-label="input">');
    const sequence: Array<{ key: string; tag: string; text: string }> = [];
    for (const key of [...Array<string>(8).fill("Tab"), ...Array<string>(4).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      sequence.push({ key, ...await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? "", text: document.activeElement?.textContent ?? "" })) });
    }
    return { sequence, plainTabReachesLink: sequence.some((step) => step.key === "Tab" && step.tag === "A") };
  } finally { await context.close(); }
}

async function activeIs(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element === document.activeElement);
}

async function focusByTab(page: Page, locator: Locator, maximum = 80): Promise<void> {
  for (let index = 0; index < maximum; index++) {
    await page.keyboard.press("Tab");
    if (await activeIs(locator)) return;
  }
  throw new Error(`Target not keyboard reachable: ${await locator.getAttribute("href") ?? await locator.textContent()}`);
}

async function machineFocus(locator: Locator): Promise<string> {
  const value = await locator.evaluate((element) => {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return { focused: element === document.activeElement, outline: style.outlineStyle, width: parseFloat(style.outlineWidth),
      color: style.outlineColor, visibility: style.visibility, rect: { width: rect.width, height: rect.height } };
  });
  requireCondition(value.focused && value.visibility !== "hidden" && value.rect.width > 0 && value.rect.height > 0,
    `Focus is hidden: ${JSON.stringify(value)}`);
  requireCondition(value.outline !== "none" && value.width > 0 && value.color !== "rgba(0, 0, 0, 0)", `No machine-detectable outline: ${JSON.stringify(value)}`);
  return JSON.stringify(value);
}

async function mobileOpen(page: Page): Promise<{ outer: Locator; group: Locator; child: Locator }> {
  const outer = page.locator(".mobile-nav > summary");
  await focusByTab(page, outer); await page.keyboard.press("Enter");
  await page.locator(".mobile-nav[open]").waitFor();
  const group = page.locator(".mobile-nav__group > summary").first();
  await focusByTab(page, group); await page.keyboard.press("Space");
  await page.locator(".mobile-nav__group[open]").first().waitFor();
  const child = page.locator(".mobile-nav__children li a").first();
  await focusByTab(page, child);
  return { outer, group, child };
}

async function assertionsFor(page: Page, planned: BrowserCase, baseUrl: string, httpStatus: number, errors: string[]): Promise<BrowserEvidenceRow["assertions"]> {
  const results: BrowserEvidenceRow["assertions"] = [];
  const reset = async () => { await page.goto(baseUrl + planned.route, { waitUntil: "networkidle" }); };
  for (const name of planned.requiredAssertions) {
    if (name === "browser-errors") continue;
    try {
      let detail = "";
      switch (name) {
        case "http-status":
          requireCondition(httpStatus === (planned.role === "recovery-404" ? 404 : 200), `HTTP ${httpStatus}`);
          detail = `HTTP ${httpStatus}`; break;
        case "visible-h1": {
          const headings = page.locator("h1:visible"); requireCondition(await headings.count() === 1, "Expected one visible H1");
          detail = await headings.innerText(); break;
        }
        case "main-content":
          requireCondition(await page.locator("main#main-content").isVisible(), "Main content is missing/hidden"); detail = "main#main-content visible"; break;
        case "document-overflow": {
          await reset();
          const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
          requireCondition(geometry.scroll <= geometry.client + 1, `Document overflow: ${JSON.stringify(geometry)}`);
          detail = JSON.stringify(geometry); break;
        }
        case "skip-link":
          requireCondition(await page.locator('.skip-link[href="#main-content"]').count() === 1, "Missing skip link"); detail = "one skip link targets main"; break;
        case "skip-keyboard": {
          await reset(); await page.keyboard.press("Tab"); const skip = page.locator(".skip-link");
          requireCondition(await activeIs(skip), "First Tab does not focus skip link");
          detail = await machineFocus(skip); await page.keyboard.press("Enter");
          requireCondition(await page.evaluate(() => location.hash === "#main-content"), "Skip activation did not navigate to main");
          await page.keyboard.press("Tab");
          const destination = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href"),
            beyondHeader: !!document.activeElement?.closest("#main-content, .site-footer"), inHeader: !!document.activeElement?.closest(".site-header"), skip: document.activeElement?.classList.contains("skip-link") }));
          requireCondition(destination.beyondHeader && !destination.inHeader && !destination.skip, `Sequential skip path returned to repeated navigation: ${JSON.stringify(destination)}`);
          detail += `; next Tab beyond header: ${JSON.stringify(destination)}`;
          break;
        }
        case "footer-keyboard": {
          await reset(); const last = page.locator('.site-footer a[href="/#top"]');
          await focusByTab(page, last); detail = await machineFocus(last);
          await page.keyboard.press("Shift+Tab");
          requireCondition(!await activeIs(last), "Reverse Tab did not move");
          await page.keyboard.press("Tab"); requireCondition(await activeIs(last), "Final footer link is not reversible by keyboard");
          break;
        }
        case "navigation-mode": {
          await reset(); const mobile = planned.viewport.width <= 900;
          requireCondition(await page.locator(".mobile-nav").isVisible() === mobile, "Mobile visibility differs from <=900 contract");
          requireCondition(await page.locator(".desktop-nav").isVisible() === !mobile, "Desktop visibility differs from >900 contract");
          detail = mobile ? "mobile: <=900" : "desktop: >900"; break;
        }
        case "navigation-keyboard": {
          await reset();
          if (planned.viewport.width <= 900) {
            const { outer, group, child } = await mobileOpen(page);
            detail = await machineFocus(child);
            await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
            requireCondition(await activeIs(child), "Nested child reverse Tab is incoherent");
            if (planned.javascript) {
              await page.keyboard.press("Escape");
              requireCondition(await page.locator(".mobile-nav__group[open]").count() === 0 && await activeIs(group), "Nested Escape/focus restore failed");
              requireCondition(await page.locator(".mobile-nav[open]").count() === 1, "Innermost Escape closed outer disclosure");
              await machineFocus(group); await page.keyboard.press("Escape");
              requireCondition(await page.locator(".mobile-nav[open]").count() === 0 && await activeIs(outer), "Outer Escape/focus restore failed");
              await machineFocus(outer);
            } else {
              await Promise.all([page.waitForURL("**/guides/getting-started/"), page.keyboard.press("Enter")]);
              requireCondition(await page.locator("article .prose").isVisible(), "Native no-JS anchor did not reach content");
            }
          } else {
            const parent = page.locator(".desktop-nav__group:has(.desktop-nav__menu) > .desktop-nav__link").first();
            await focusByTab(page, parent);
            const child = page.locator(".desktop-nav__menu a").first();
            await child.waitFor({ state: "visible" }); await page.keyboard.press("Tab");
            requireCondition(await activeIs(child), "Desktop submenu child is not keyboard reachable");
            detail = await machineFocus(child); await page.keyboard.press("Shift+Tab");
            requireCondition(await activeIs(parent), "Desktop reverse Tab did not restore parent");
          }
          break;
        }
        case "target-size": {
          await reset();
          if (planned.viewport.width <= 900) {
            const { outer, group, child } = await mobileOpen(page);
            const sizes = await Promise.all([outer, group, child].map((locator) => locator.boundingBox()));
            requireCondition(sizes.every((size) => size && size.width >= 44 && size.height >= 44), `Mobile controls below 44x44 intent: ${JSON.stringify(sizes)}`);
            detail = JSON.stringify(sizes);
          } else {
            const brand = await page.locator("a.brand").boundingBox();
            requireCondition(brand && brand.width >= 44 && brand.height >= 44, "Brand target intent is below 44x44");
            detail = `44x44 brand; text navigation target review remains human: ${JSON.stringify(brand)}`;
          }
          break;
        }
        case "nested-cleanup": {
          await reset();
          if (planned.viewport.width <= 900) {
            const { outer } = await mobileOpen(page);
            // Native ancestor toggle exercises the shipped cleanup listener without recreating it.
            await outer.click(); await page.waitForFunction(() => document.querySelectorAll(".mobile-nav details[open]").length === 0);
            requireCondition(await page.locator(".mobile-nav[open]").count() === 0 && await activeIs(outer), "Ancestor close left hidden focus/open descendants");
            await page.keyboard.press("Enter");
            requireCondition(await page.locator(".mobile-nav details[open]").count() === 0, "Reopening retained nested state");
            detail = "native ancestor close cleans nested details and restores visible trigger";
          } else detail = "desktop has no disclosure state; mobile disclosure hidden/closed";
          break;
        }
        case "ordinary-navigation": {
          await reset();
          if (planned.viewport.width <= 900) { const { child } = await mobileOpen(page); await child.press("Enter"); }
          else { const link = page.locator(".desktop-nav__menu a").first(); await focusByTab(page, link); await page.keyboard.press("Enter"); }
          await page.waitForURL("**/guides/getting-started/");
          requireCondition(await page.locator("article").isVisible(), "Ordinary navigation did not render detail");
          detail = "real child anchor reaches /guides/getting-started/"; break;
        }
        case "same-document-focus": {
          await reset();
          if (planned.viewport.width <= 900) {
            const { outer } = await mobileOpen(page);
            const home = page.locator('.mobile-nav__list > li > a[href="/"]');
            await home.click();
            requireCondition(await page.locator(".mobile-nav[open]").count() === 0 && await page.locator(".brand").evaluate((element) => element === document.activeElement), "Same-document home focus did not restore");
            requireCondition(!await activeIs(outer), "Focus remained on closed menu trigger");
            detail = "same-document home anchor closes menu and focuses visible brand";
          } else detail = "desktop native anchors; no hidden disclosure to restore";
          break;
        }
        case "article-content":
          await reset(); requireCondition(await page.locator("article .prose").isVisible() && await page.locator(".prose h2").count() === 1, "Article or existing heading path unavailable");
          detail = "actual WikiArticle/prose visible; original single H2 retained"; break;
        case "table-local-scroll": {
          await reset(); const geometry = await page.locator("[data-browser-wide-table]").evaluate((table) => {
            const wrapper = table.closest(".table-scroll")!;
            return { tableWidth: table.getBoundingClientRect().width, wrapperClient: wrapper.clientWidth, wrapperScroll: wrapper.scrollWidth,
              overflow: getComputedStyle(wrapper).overflowX, documentClient: document.documentElement.clientWidth, documentScroll: document.documentElement.scrollWidth };
          });
          requireCondition(["auto", "scroll"].includes(geometry.overflow) && geometry.wrapperScroll > geometry.wrapperClient + 1 && geometry.tableWidth > geometry.wrapperClient + 1 && geometry.documentScroll <= geometry.documentClient + 1,
            `Local table overflow contract failed: ${JSON.stringify(geometry)}`);
          const wrapper = page.locator(".table-scroll");
          await focusByTab(page, wrapper);
          await wrapper.evaluate((element) => element.addEventListener("keydown", (event) => {
            element.setAttribute("data-browser-last-key", (event as KeyboardEvent).key);
          }, { passive: true, once: true }));
          const before = await wrapper.evaluate((element) => ({ active: document.activeElement === element, scroll: element.scrollLeft }));
          await page.keyboard.press("ArrowRight");
          try { await page.waitForFunction(() => (document.querySelector(".table-scroll")?.scrollLeft ?? 0) > 0); }
          catch {
            const after = await wrapper.evaluate((element) => ({ active: document.activeElement === element, scroll: element.scrollLeft, key: element.getAttribute("data-browser-last-key") }));
            throw new Error(`Native ArrowRight did not scroll: ${JSON.stringify({ before, after, geometry })}`);
          }
          detail = JSON.stringify(geometry) + "; real ArrowRight scroll observed"; break;
        }
        case "recovery-navigation": {
          await reset(); const links = page.getByRole("navigation", { name: "Recovery links" }).locator("a");
          const destinations = await links.evaluateAll((elements) => elements.map((element) => (element as HTMLAnchorElement).getAttribute("href")));
          requireCondition(destinations.includes("/") && destinations.includes("/search/"), "Actual recovery destinations missing");
          const home = page.getByRole("link", { name: "Back to home", exact: true });
          await focusByTab(page, home); await machineFocus(home); await page.keyboard.press("Enter");
          await page.waitForURL(baseUrl + "/");
          const searchResponse = await page.request.get(baseUrl + "/search/");
          requireCondition(searchResponse.status() === 200, "Recovery search destination not published");
          detail = "missing URL HTTP404; keyboard home activation succeeds; search HTTP200"; break;
        }
        case "layout-boundary": {
          await reset(); const small = planned.viewport.width <= 620;
          const raw = await page.evaluate(() => ({
            headerHeight: getComputedStyle(document.querySelector(".site-header__inner")!).minHeight,
            descriptor: getComputedStyle(document.querySelector(".brand__copy small")!).display,
            article: document.querySelector(".article__layout") ? getComputedStyle(document.querySelector(".article__layout")!).gridTemplateColumns : null,
            meta: document.querySelector(".article__meta") ? getComputedStyle(document.querySelector(".article__meta")!).gridTemplateColumns : null,
            recovery: document.querySelector(".not-found") ? getComputedStyle(document.querySelector(".not-found")!).gridTemplateColumns : null,
            writing: document.querySelector(".not-found__code") ? getComputedStyle(document.querySelector(".not-found__code")!).writingMode : null,
            transform: document.querySelector(".not-found__code") ? getComputedStyle(document.querySelector(".not-found__code")!).transform : null,
          }));
          const styles = { ...raw, headerHeight: parseFloat(raw.headerHeight), articleColumns: raw.article?.split(" ").filter(Boolean).length ?? null,
            metaColumns: raw.meta?.split(" ").filter(Boolean).length ?? null, recoveryColumns: raw.recovery?.split(" ").filter(Boolean).length ?? null };
          requireCondition(styles.headerHeight === (small ? 74 : 88) && (styles.descriptor === "none") === small, `620 header oracle mismatch: ${JSON.stringify(styles)}`);
          if (planned.role === "content-detail") requireCondition(styles.articleColumns === 1 && styles.metaColumns === (small ? 1 : 2), `620 detail metadata oracle mismatch: ${JSON.stringify(styles)}`);
          if (planned.role === "recovery-404") requireCondition(styles.recoveryColumns === (small ? 1 : 2) && styles.writing === (small ? "horizontal-tb" : "vertical-rl") && (styles.transform === "none") === small, `620 recovery oracle mismatch: ${JSON.stringify(styles)}`);
          detail = JSON.stringify(styles); break;
        }
        case "reduced-motion": {
          await reset(); const motion = await page.evaluate(() => ({ matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
            scroll: getComputedStyle(document.documentElement).scrollBehavior,
            durations: Array.from(document.querySelectorAll(".reveal, a, summary")).map((element) => ({ animation: getComputedStyle(element).animationDuration, transition: getComputedStyle(element).transitionDuration })) }));
          const collapsed = (value: string) => value.split(",").every((part) => parseFloat(part) <= 0.001);
          requireCondition(motion.matches && motion.scroll === "auto" && motion.durations.every((value) => collapsed(value.animation) && collapsed(value.transition)), `Reduced-motion contract failed: ${JSON.stringify(motion)}`);
          requireCondition(await page.locator("h1").isVisible(), "Reduced motion hid content"); detail = JSON.stringify(motion); break;
        }
        case "resize-focus": {
          await reset(); const { outer, child } = await mobileOpen(page);
          const pageId = await child.locator("..").getAttribute("data-nav-page-id"); requireCondition(pageId, "Child has no page identity");
          await page.setViewportSize({ width: 901, height: 800 });
          await page.waitForFunction(() => !matchMedia("(max-width: 900px)").matches);
          await page.locator(".desktop-nav").waitFor({ state: "visible" });
          const desktop = page.locator(`.desktop-nav [data-nav-page-id="${pageId}"] a`);
          try { await page.waitForFunction((id) => document.activeElement?.closest(".desktop-nav [data-nav-page-id]")?.getAttribute("data-nav-page-id") === id, pageId); }
          catch {
            const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href"), pageId: document.activeElement?.closest("[data-nav-page-id]")?.getAttribute("data-nav-page-id") }));
            throw new Error(`Live resize CSS/MQ settled but focus did not migrate: ${JSON.stringify(focus)}`);
          }
          requireCondition(await page.locator(".mobile-nav[open], .mobile-nav details[open]").count() === 0, "Resize did not close nested mobile state");
          await machineFocus(desktop); await page.setViewportSize({ width: 899, height: 800 });
          await page.waitForFunction(() => matchMedia("(max-width: 900px)").matches);
          await page.locator(".mobile-nav").waitFor({ state: "visible" });
          await page.waitForFunction(() => document.activeElement === document.querySelector(".mobile-nav > summary"));
          requireCondition(await activeIs(outer), "Reverse resize failed to focus mobile trigger"); detail = `${pageId}: mobile child -> desktop child -> mobile trigger`; break;
        }
        default: throw new Error(`Unimplemented assertion ${name}`);
      }
      results.push({ name, passed: true, detail });
    } catch (error) { results.push({ name, passed: false, detail: message(error) }); }
  }
  results.push({ name: "browser-errors", passed: errors.length === 0, detail: errors.length ? errors.join("\n") : "no pageerror/unexpected console.error" });
  return results;
}

export async function runCoreBrowserEvidence(): Promise<void> {
  const root = process.cwd();
  const output = resolve(process.env.CORE_BROWSER_EVIDENCE_DIR ?? join(root, ".browser-evidence"));
  const contractPath = resolve(join(root, "../GAME_SOP_V2.7/docs/COMMERCIAL_GAME_SITE_PRODUCT_CONTRACT_V2.7.md"));
  mkdirSync(output, { recursive: true });
  const identity: EvidenceIdentity = {
    starter: { branch: "", head: "", workingTreeSha256: "" }, canonicalContract: { reference: canonicalContractReference, verification: null },
    fixture: { identity: "Field Notes synthetic adoption", sourceSha256: "" }, build: { distSha256: "" },
    playwright: { packageVersion: "1.63.0" }, host: { platform: process.platform, arch: process.arch, node: process.version },
    engines: { chromium: { browserName: "chromium", version: "", revision: "" }, firefox: { browserName: "firefox", version: "", revision: "" }, webkit: { browserName: "webkit", version: "", revision: "" } },
  };
  const report: CoreBrowserEvidence = {
    schemaVersion: "1", identity, overall: "FAIL", infrastructureErrors: [],
    cleanup: { previewStopped: false, fixtureRemoved: false }, humanReview: { visualFocus: "DEFERRED", contrast: "DEFERRED" },
    rows: coreBrowserMatrix.map(({ requiredAssertions: _, ...planned }) => ({ ...planned, browserVersion: "", browserRevision: "",
      sourceSha256: "", buildSha256: "", httpStatus: 0, assertions: [], caseStatus: "NOT_RUN", durationMs: 0, failure: "not executed" })),
  };
  let fixture: string | undefined; let previewPid: number | undefined; let previewAttempted = false;
  const cleanupAudit = { startedPid: null as number | null, astroStopExit: null as number | null,
    pidAliveBeforeStop: false, pidAliveAfterStop: false, fallbackSignalUsed: false, fixtureRemoved: false };
  const browsers: Partial<Record<BrowserEngine, Browser>> = {};
  try {
    requireCondition(validateMatrix().length === 0, validateMatrix().join("; "));
    identity.starter = { branch: git(root, ["branch", "--show-current"]), head: git(root, ["rev-parse", "HEAD"]), workingTreeSha256: manifest(root) };
    requireCondition(identity.starter.branch, "Unbound source branch");
    identity.canonicalContract = resolveContractBinding(process.env.CORE_BROWSER_CONTRACT_MODE, process.env.CORE_BROWSER_CONTRACT_PATH, contractPath);
    const packagePath = join(root, "node_modules/playwright/package.json");
    requireCondition(JSON.parse(readFileSync(packagePath, "utf8")).version === "1.63.0", "Actual Playwright version differs from pinned dependency");
    const metadata = JSON.parse(readFileSync(join(root, "node_modules/playwright-core/browsers.json"), "utf8")) as {
      browsers: Array<{ name: string; revision: string; revisionOverrides?: Record<string, string> }>;
    };
    fixture = createFullProjectFixture(true);
    const guide = join(fixture, "src/content/guides/getting-started.mdx");
    writeFileSync(guide, readFileSync(guide, "utf8") + '\n<div className="table-scroll" tabIndex={0} role="region" aria-label="Reference comparison">\n<table data-browser-wide-table><caption>Reference comparison</caption><thead><tr><th>Route</th><th>Evidence</th><th>Recovery</th><th>Decision</th></tr></thead><tbody><tr><td>First route</td><td>Documented observations</td><td>Return to reference</td><td>Compare the available choices</td></tr></tbody></table>\n</div>\n');
    identity.fixture.sourceSha256 = manifest(fixture);
    const build = spawnSync("npm", ["run", "build"], { cwd: fixture, encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    console.log(build.stdout ?? ""); console.error(build.stderr ?? "");
    assertVerificationResult(build, "success");
    requireCondition(manifest(fixture) === identity.fixture.sourceSha256, "Fixture source changed during build");
    for (const path of ["EVIDENCE_BUILD_NOT_FINAL.json", "privacy/index.html", "terms/index.html"]) requireCondition(!existsSync(join(fixture, "dist", path)), `Forbidden final artifact: ${path}`);
    identity.build.distSha256 = manifest(join(fixture, "dist"));
    const port = await freePort(); const baseUrl = `http://127.0.0.1:${port}`;
    previewAttempted = true;
    const preview = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixture, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 });
    console.log(preview.stdout ?? ""); console.error(preview.stderr ?? "");
    previewPid = Number(preview.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined;
    cleanupAudit.startedPid = previewPid ?? null;
    assertVerificationResult(preview, "success");
    requireCondition(previewPid && preview.stdout.includes(baseUrl), "Cannot bind own preview PID/URL");
    let ready = false;
    for (let retry = 0; retry < 80; retry++) {
      requireCondition(pidAlive(previewPid), "Own preview PID stopped before readiness");
      try { ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(500) })).status === 200; } catch { /* Wait for this process's preview to listen. */ }
      if (ready) break; await delay(250);
    }
    requireCondition(ready, "Preview readiness timeout");
    const types = { chromium, firefox, webkit };
    for (const engine of browserEngines) {
      try {
        const record = metadata.browsers.find((item) => item.name === engine); requireCondition(record, `Missing ${engine} revision metadata`);
        const directory = types[engine].executablePath().split(/[/\\]/).find((part) => new RegExp(`^${engine}-\\d+$`).test(part));
        const revision = directory?.match(new RegExp(`^${engine}-(\\d+)$`))?.[1];
        requireCondition(revision && [record.revision, ...Object.values(record.revisionOverrides ?? {})].includes(revision), `Unrecognized installed revision: ${directory}`);
        browsers[engine] = await types[engine].launch({ headless: true });
        identity.engines[engine] = { browserName: engine, version: browsers[engine]!.version(), revision };
      } catch (error) { report.infrastructureErrors.push(`${engine}: ${message(error)}`); }
    }
    const probes: Partial<Record<BrowserEngine, Awaited<ReturnType<typeof nativeKeyboardProbe>>>> = {};
    for (const engine of browserEngines) {
      if (!browsers[engine]) continue;
      probes[engine] = await nativeKeyboardProbe(browsers[engine]!);
      if (!probes[engine]!.plainTabReachesLink) report.infrastructureErrors.push(`${engine.toUpperCase()}_STANDARD_TAB_LINK_PROFILE_UNAVAILABLE`);
    }
    writeFileSync(join(output, "native-keyboard-probe.json"), JSON.stringify(probes, null, 2) + "\n");
    for (let index = 0; index < coreBrowserMatrix.length; index++) {
      const planned = coreBrowserMatrix[index]; const row = report.rows[index]; const browser = browsers[planned.engine];
      row.sourceSha256 = identity.fixture.sourceSha256; row.buildSha256 = identity.build.distSha256;
      row.browserVersion = identity.engines[planned.engine].version; row.browserRevision = identity.engines[planned.engine].revision;
      if (!browser) { row.failure = `required ${planned.engine} unavailable`; continue; }
      const start = performance.now();
      const context = await browser.newContext({ viewport: planned.viewport, javaScriptEnabled: planned.javascript, reducedMotion: planned.reducedMotion });
      try {
        const page = await context.newPage(); await page.bringToFront(); page.setDefaultTimeout(4000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(message(error)));
        page.on("console", (event) => {
          if (event.type() !== "error") return;
          const expected404 = planned.role === "recovery-404" && event.location().url === baseUrl + planned.route && /404/.test(event.text());
          if (!expected404) errors.push(event.text());
        });
        const response = await page.goto(baseUrl + planned.route, { waitUntil: "networkidle" }); row.httpStatus = response?.status() ?? 0;
        row.assertions = await assertionsFor(page, planned, baseUrl, row.httpStatus, errors);
        row.caseStatus = row.assertions.every((assertion) => assertion.passed) ? "PASS" : "FAIL";
        row.failure = row.caseStatus === "FAIL" ? row.assertions.filter((assertion) => !assertion.passed).map((assertion) => `${assertion.name}: ${assertion.detail}`).join("\n") : null;
        if (row.caseStatus === "FAIL") {
          await page.screenshot({ path: join(output, `${index}-failure.png`) }).catch((error) => report.infrastructureErrors.push(`failure screenshot: ${message(error)}`));
        }
      } catch (error) { row.caseStatus = "FAIL"; row.failure = message(error); }
      finally {
        try { await context.close(); } catch (error) { report.infrastructureErrors.push(`context cleanup: ${message(error)}`); }
        row.durationMs = performance.now() - start;
      }
      console.log(`${row.caseId}: ${row.caseStatus}${row.failure ? "\n" + row.failure : ""}`);
    }
    requireCondition(manifest(root) === identity.starter.workingTreeSha256, "Canonical source changed while browsers ran");
    requireCondition(manifest(join(fixture, "dist")) === identity.build.distSha256, "Final build changed while browsers ran");
  } catch (error) { report.infrastructureErrors.push(message(error)); }
  finally {
    for (const browser of Object.values(browsers)) {
      try { await browser.close(); } catch (error) { report.infrastructureErrors.push(`browser cleanup: ${message(error)}`); }
    }
    if (!previewAttempted) report.cleanup.previewStopped = true;
    else if (fixture) {
      try {
        cleanupAudit.pidAliveBeforeStop = previewPid ? pidAlive(previewPid) : false;
        const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixture, encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 });
        cleanupAudit.astroStopExit = stopped.status;
        console.log(stopped.stdout ?? ""); console.error(stopped.stderr ?? "");
        assertVerificationResult(stopped, "success");
        requireCondition(previewPid, "Cannot independently verify cleanup without own PID");
        requireCondition(await waitPidGone(previewPid), `Own preview PID ${previewPid} remains alive after Astro stop`);
        report.cleanup.previewStopped = true;
      } catch (error) {
        report.infrastructureErrors.push(`standard preview cleanup failed: ${message(error)}`);
        if (previewPid && pidAlive(previewPid)) {
          cleanupAudit.fallbackSignalUsed = true;
          try {
            process.kill(previewPid, "SIGTERM");
            if (!await waitPidGone(previewPid)) { process.kill(previewPid, "SIGKILL"); await waitPidGone(previewPid); }
          } catch (fallback) { report.infrastructureErrors.push(`own PID recovery failed: ${message(fallback)}`); }
        }
        report.cleanup.previewStopped = previewPid !== undefined && !pidAlive(previewPid);
      }
      cleanupAudit.pidAliveAfterStop = previewPid ? pidAlive(previewPid) : false;
    }
    try { if (fixture) cleanupCoreBuildFixture(fixture); report.cleanup.fixtureRemoved = !fixture || !existsSync(fixture); } catch (error) { report.infrastructureErrors.push(`fixture cleanup: ${message(error)}`); }
    cleanupAudit.fixtureRemoved = report.cleanup.fixtureRemoved;
    writeFileSync(join(output, "preview-cleanup-audit.json"), JSON.stringify(cleanupAudit, null, 2) + "\n");
  }
  report.overall = report.rows.every((row) => row.caseStatus === "PASS") && !report.infrastructureErrors.length && report.cleanup.previewStopped && report.cleanup.fixtureRemoved ? "PASS" : "FAIL";
  const errors = validateBrowserEvidence(report, identity);
  if (errors.length) report.overall = "FAIL";
  writeFileSync(join(output, "core-browser-evidence.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Core browser evidence: ${report.rows.length} planned; ${report.rows.filter((row) => row.caseStatus !== "NOT_RUN").length} executed; ${report.rows.filter((row) => row.caseStatus === "PASS").length} PASS; ${report.rows.filter((row) => row.caseStatus === "FAIL").length} FAIL; ${report.rows.filter((row) => row.caseStatus === "NOT_RUN").length} NOT_RUN`);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCoreBrowserEvidence();
