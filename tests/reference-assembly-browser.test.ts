import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import AdSlot from "../src/components/ads/AdSlot.astro";
import { adsConfig } from "../src/config/ads";
import TestAdProvider from "./fixtures/ads/TestAdProvider.astro";
import { cleanupCoreBuildFixture, createCoreBuildFixture } from "./helpers/core-build-fixture";

// Fixed observations of accepted outputs; no fixture definition, content model or new runner.
// Without explicit evidence inputs this opt-in test does not claim an assembly PASS.
const inputs = [
  { name: "A", directory: process.env.V27_ASSEMBLY_A_DIR, article: "/guides/relay-overview/", journey: ["/items/", "/items/amber-lantern/", "/maps/", "/maps/east-circuit/", "/guides/relay-overview/", "/guides/source-check/"] },
  { name: "B", directory: process.env.V27_ASSEMBLY_B_DIR, article: "/guides/relay-budget/", journey: ["/guides/", "/guides/relay-budget/", "/tools/relay-budget/", "/guides/relay-budget/", "/guides/check-budget/"] },
  { name: "C", directory: process.env.V27_ASSEMBLY_C_DIR, article: "/guides/light-system/", journey: ["/guides/", "/guides/light-system/", "/guides/supply-system/", "/guides/route-system/", "/meta/relay-priorities/"] },
];
const outputDirectory = process.env.V27_ASSEMBLY_EVIDENCE_DIR;
const offlineAds = process.env.V27_ASSEMBLY_ADS === "offline";
const adsOnly = offlineAds || process.env.V27_ASSEMBLY_ADS === "1";
let interactionFailed = false;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; } }
function identity(directory: string): string {
  const hash = createHash("sha256");
  function visit(path: string) { for (const item of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) { const full = join(path, item.name); if (item.isDirectory()) visit(full); else { hash.update(`${relative(directory, full)}\0`); hash.update(readFileSync(full)); } } }
  visit(directory); return hash.digest("hex");
}

describe("accepted ABC output targeted Chromium assembly observations", () => {
  for (const input of inputs) it.skipIf(adsOnly || !input.directory || !outputDirectory)(`observes REF-${input.name} without rebuilding its content`, async (testContext) => {
    if (interactionFailed) testContext.skip("NOT_RUN: stopped after prior interaction failure; no artificial PASS.");
    const source = realpathSync(input.directory!);
    const destination = realpathSync(outputDirectory!);
    if (!relative(process.cwd(), destination).startsWith("../") || !relative(process.cwd(), source).startsWith("../")) throw new Error("Assembly evidence must remain outside source project.");
    expect(JSON.parse(readFileSync(join(source, "EVIDENCE_BUILD_NOT_FINAL.json"), "utf8"))).toMatchObject({ final: false, mode: "evidence" });
    const sourceIdentity = identity(source);
    const fixture = createCoreBuildFixture(`starter-reference-assembly-${input.name.toLowerCase()}-`);
    let pid: number | undefined; let attempted = false; let cleanupError: unknown;
    const originalEnabled = adsConfig.enabled; const originalPlacements = { ...adsConfig.placements };
    try {
      cpSync(source, join(fixture, "dist"), { recursive: true });
      expect(identity(join(fixture, "dist"))).toBe(sourceIdentity);
      const port = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); if (!address || typeof address === "string") { server.close(); reject(new Error("No reserved port")); return; } server.close(error => error ? reject(error) : resolve(address.port)); }); });
      attempted = true;
      const started = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixture, encoding: "utf8", timeout: 30_000 });
      pid = Number(started.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined;
      console.log(`REF-${input.name} assembly preview start exit=${started.status}\n${started.stdout}\n${started.stderr}`);
      expect(started.error).toBeUndefined(); expect(started.status).toBe(0); expect(pid).toBeDefined();
      const base = `http://127.0.0.1:${port}`; expect(started.stdout).toContain(base);
      const browser = await chromium.launch({ headless: true });
      const observations: unknown[] = [];
      try {
        console.log(`REF-${input.name} assembly build SHA256=${sourceIdentity}; Chromium ${browser.version()}; Playwright1.63.0`);
        if (process.env.V27_ASSEMBLY_INTERACTION === "1") {
          const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: "no-preference" });
          try {
            const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
            await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
            await page.goto(`${base}${input.article}`, { waitUntil: "networkidle" });
            const group = page.locator('.desktop-nav__group:has(.desktop-nav__menu)').first();
            await group.locator('.desktop-nav__link').hover();
            const menu = group.locator('.desktop-nav__menu');
            await expect.poll(() => menu.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
            expect(await menu.evaluate(node => ({ opacity: getComputedStyle(node).opacity, pointer: getComputedStyle(node).pointerEvents }))).toEqual({ opacity: "1", pointer: "auto" });
            const target = menu.locator('a').first(); const href = await target.getAttribute("href");
            const contrast = await target.evaluate(node => {
              // Only measured text-on-opaque CSS backgrounds; not a visual/Human assessment.
              const measure = (element: Element) => {
                const style = getComputedStyle(element); let parent: Element | null = element; let background = "";
                while (parent) { const color = getComputedStyle(parent).backgroundColor; if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; } parent = parent.parentElement; }
                const rgb = (color: string) => { const values = color.match(/[\d.]+/g)?.map(Number) ?? []; if (values.length < 3 || values.length === 4 && values[3] !== 1) throw new Error(`Unresolved non-opaque contrast color ${color}`); return values.slice(0, 3).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }); };
                const luminance = (color: string) => { const [red, green, blue] = rgb(color); return red * 0.2126 + green * 0.7152 + blue * 0.0722; };
                const foreground = luminance(style.color); const back = luminance(background);
                return { text: element.textContent?.trim(), foreground: style.color, background, ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05), fontSize: style.fontSize, threshold: 4.5 };
              };
              return [...node.querySelectorAll("span, small")].map(measure);
            });
            console.log(`REF-${input.name} actual desktop menu text contrast ${JSON.stringify(contrast)}`);
            for (const measurement of contrast) expect(measurement.ratio).toBeGreaterThanOrEqual(measurement.threshold);
            await target.click({ timeout: 5000 }); await page.waitForURL(`${base}${href}`); await page.waitForLoadState("networkidle");
            observations.push({ status: "PASS", observation: "desktop pointer", viewport: "1280x960", motion: "no-preference", actualAction: "hover parent link opens menu; pointer click first child", destination: href, contrast });
            console.log(`REF-${input.name} desktop pointer PASS hover opens actual menu; childclick reaches ${href} without force/interception`);
            for (const width of [1280, 390]) {
              await page.setViewportSize({ width, height: width === 390 ? 844 : 960 }); await page.goto(`${base}${input.article}`, { waitUntil: "networkidle" });
              await page.keyboard.press("Tab"); expect(await page.locator('.skip-link').evaluate(node => document.activeElement === node)).toBe(true);
              const focus = await page.locator('.skip-link').evaluate(node => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, outlineColor: style.outlineColor, transform: style.transform, visible: rect.top >= 0 && rect.bottom <= innerHeight, color: style.color, background: style.backgroundColor }; });
              expect(focus.visible).toBe(true); expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(3); expect(focus.outlineStyle).toBe("solid");
              await page.keyboard.press("Enter"); expect(new URL(page.url()).hash).toBe("#main-content"); await page.keyboard.press("Tab");
              expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#main-content, .site-footer')))).toBe(true);
              const current = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href") }));
              await page.keyboard.press("Shift+Tab"); const previous = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href") })); expect(previous).not.toEqual(current);
              await page.keyboard.press("Tab"); expect(await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href") }))).toEqual(current);
              const motion = await page.evaluate(() => ({ preference: matchMedia('(prefers-reduced-motion: reduce)').matches, scroll: getComputedStyle(document.documentElement).scrollBehavior })); expect(motion).toEqual({ preference: false, scroll: "smooth" });
              observations.push({ status: "PASS", observation: "skip sequential keyboard and default motion", viewport: `${width}x${width === 390 ? 844 : 960}`, actualAction: "Tab skip; Enter main; Tab beyond header; ShiftTab; Tab returns", focus, current, motion });
              console.log(`REF-${input.name} ${width} skip/sequential Tab/ShiftTab/Enter PASS; visible 3px focus; motion no-preference smooth distinct from S5 reduce`);
            }
            await page.goto(`${base}${input.article}`, { waitUntil: "networkidle" });
            await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
            const root = page.locator('details.mobile-nav'); const rootSummary = root.locator(':scope > summary'); expect(await rootSummary.evaluate(node => document.activeElement === node)).toBe(true);
            await page.keyboard.press("Space"); expect(await root.getAttribute("open")).not.toBeNull();
            await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
            const nested = page.locator('details.mobile-nav__group').first(); const nestedSummary = nested.locator(':scope > summary'); expect(await nestedSummary.evaluate(node => document.activeElement === node)).toBe(true);
            await page.keyboard.press("Enter"); expect(await nested.getAttribute("open")).not.toBeNull(); await page.keyboard.press("Tab");
            const overview = nested.locator('.mobile-nav__overview'); expect(await overview.evaluate(node => document.activeElement === node)).toBe(true);
            const geometry = await page.locator('details.mobile-nav summary, details.mobile-nav a').evaluateAll(nodes => nodes.filter(node => {
              if (!node.getClientRects().length || getComputedStyle(node).visibility === "hidden") return false;
              // Closed sibling disclosures can still expose layout rectangles: exclude their hidden children.
              for (let ancestor = node.parentElement?.closest("details"); ancestor; ancestor = ancestor.parentElement?.closest("details")) {
                if (!(ancestor as HTMLDetailsElement).open && node !== ancestor.querySelector(":scope > summary")) return false;
              }
              return true;
            }).map(node => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return { text: node.textContent?.trim(), width: rect.width, height: rect.height, color: style.color, background: style.backgroundColor, outline: style.outlineStyle, focused: document.activeElement === node }; }));
            for (const control of geometry) { expect(control.width).toBeGreaterThanOrEqual(24); expect(control.height).toBeGreaterThanOrEqual(24); }
            expect(geometry.some(control => control.focused && control.outline !== "none")).toBe(true);
            await page.keyboard.press("Escape"); expect(await nested.getAttribute("open")).toBeNull(); expect(await nestedSummary.evaluate(node => document.activeElement === node)).toBe(true);
            await page.keyboard.press("Escape"); expect(await root.getAttribute("open")).toBeNull(); expect(await rootSummary.evaluate(node => document.activeElement === node)).toBe(true);
            observations.push({ status: "PASS", observation: "mobile native summary keys/nested escape", viewport: "390x844", actualAction: "Tab to Menu; Space opens; Tab group; Enter opens; Tab overview; Escape group; Escape root", visibleControls: geometry, threshold: "24x24 CSSpx measured controls; no all-site target claim", humanFocusJudgment: "PENDING" });
            // Exact boundary, preserving an actual keyboard-selected page identity across modes.
            await page.keyboard.press("Space"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
            expect(await overview.evaluate(node => document.activeElement === node)).toBe(true); const overviewHref = await overview.getAttribute("href");
            await page.setViewportSize({ width: 900, height: 960 }); expect(await overview.evaluate(node => document.activeElement === node)).toBe(true);
            await page.setViewportSize({ width: 901, height: 960 }); await page.waitForTimeout(100);
            const desktopMatch = page.locator(`.desktop-nav__link[href="${overviewHref}"]`); expect(await desktopMatch.evaluate(node => document.activeElement === node)).toBe(true); expect(await page.locator('details.mobile-nav[open], details.mobile-nav details[open]').count()).toBe(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
            await page.keyboard.press("Enter"); await page.waitForURL(`${base}${overviewHref}`); await page.waitForLoadState("networkidle");
            await desktopMatch.focus(); await page.setViewportSize({ width: 900, height: 960 }); await page.waitForTimeout(100); expect(await rootSummary.evaluate(node => document.activeElement === node)).toBe(true);
            expect(await root.getAttribute("open")).toBeNull(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
            await page.keyboard.press("Space"); expect(await root.getAttribute("open")).not.toBeNull();
            observations.push({ status: "PASS", observation: "responsive 390→900→901→900", viewport: "900/901x960", actualAction: "focused mobileoverview→same900→matchingdesktop901→Enter correcthub→keyboardfocus→Menu900; Spaceoperable", destination: overviewHref, nestedStateLeak: false, overflow: false });
            expect(errors).toEqual([]);
            console.log(`REF-${input.name} mobile Space/Enter/nestedEscape; measured${geometry.length} visiblecontrols >=24px; 900/901 focushandoff/statecleanup/operability PASS; JSerrors0`);
          } catch (error) {
            interactionFailed = true;
            console.error(`REF-${input.name} interaction FAIL; no Core repair or artificial PASS: ${String(error)}`);
            observations.push({ status: "FAIL", observation: "interaction stopped", error: String(error) });
            writeFileSync(join(destination, `REF-${input.name}-interaction-failure.json`), JSON.stringify(observations, null, 2));
            throw error;
          } finally { await context.close(); }
          const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, reducedMotion: "no-preference" });
          try {
            const page = await noJs.newPage(); await page.goto(`${base}${input.article}`, { waitUntil: "networkidle" });
            expect(await page.locator('main#main-content').isVisible()).toBe(true);
            await page.locator('details.mobile-nav > summary').click(); const nested = page.locator('details.mobile-nav__group').first(); await nested.locator(':scope > summary').click();
            const overview = nested.locator('.mobile-nav__overview'); const href = await overview.getAttribute("href"); await overview.click(); await page.waitForURL(`${base}${href}`);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
            observations.push({ status: "PASS", observation: "no-JS native details/content fallback", viewport: "390x844", javascript: false, motion: "no-preference", actualAction: "nativeMenu/group clicks→overview correcthub", destination: href, scriptedEscapeFocus: "NOT_RUN requiresJS", toolHydration: "NOT_RUN noJScalculatornotclaimed" });
            console.log(`REF-${input.name} no-JS native details→overview ${href} PASS; contentvisible/nooverflow; no scriptedEscape or calculator fallback claim`);
          } finally { await noJs.close(); }
        } else {
        for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
          const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
          const errors: string[] = []; const blocked: string[] = [];
          try {
            await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== base && ["http:", "https:"].includes(url.protocol)) { blocked.push(url.href); return route.abort(); } return route.continue(); });
            const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
            expect((await page.goto(base, { waitUntil: "networkidle" }))?.status()).toBe(200);
            expect(await page.locator(".ad-slot").count()).toBe(0);
            // Route/link crawl is HTTP evidence, distinct from the task clicks below.
            const crawl: string[] = [];
            for (const route of [...new Set(["/", ...input.journey])]) {
              const response = await context.request.get(`${base}${route}`); expect(response.status()).toBe(200);
              const body = await response.text(); const hrefs = [...body.matchAll(/href="(\/[^"#?]*)"/g)].map(match => match[1]);
              for (const href of [...new Set(hrefs)]) { expect((await context.request.get(`${base}${href}`)).status(), `${route} -> ${href}`).toBe(200); }
              crawl.push(route);
            }
            // Actual clicks follow existing authored links, with menu opened when needed.
            for (const route of input.journey) {
              const contentLinks = page.locator(`main a[href="${route}"]`);
              const candidates = await contentLinks.count() ? contentLinks : page.locator(`a[href="${route}"]`);
              let clicked = false;
              for (let index = 0; index < await candidates.count(); index++) if (await candidates.nth(index).isVisible()) { await candidates.nth(index).click(); clicked = true; break; }
              if (!clicked && viewport.width === 390) {
                const menu = page.locator("details.mobile-nav"); if (await menu.getAttribute("open") === null) await menu.locator(":scope > summary").click();
                for (const group of await page.locator("details.mobile-nav__group").all()) if (await group.locator(`a[href="${route}"]`).count()) { if (await group.getAttribute("open") === null) await group.locator(":scope > summary").click(); }
                for (let index = 0; index < await candidates.count(); index++) if (await candidates.nth(index).isVisible()) { await candidates.nth(index).click(); clicked = true; break; }
              }
              expect(clicked, `actual click to ${route}`).toBe(true); await page.waitForURL(`${base}${route}`); await page.waitForLoadState("networkidle");
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route} overflow`).toBe(true);
            }
            await page.goto(`${base}${input.article}`, { waitUntil: "networkidle" });
            const toc = page.locator('.wiki-article__toc a').first(); expect(await toc.count()).toBe(1);
            const fragment = await toc.getAttribute("href"); await toc.click(); expect(new URL(page.url()).hash).toBe(fragment);
            const media = await page.locator(".game-media img").evaluateAll(nodes => nodes.map(node => { const image = node as HTMLImageElement; const rect = image.getBoundingClientRect(); return { src: image.getAttribute("src"), loaded: image.complete && image.naturalWidth > 0, width: rect.width, viewport: innerWidth, caption: Boolean(image.closest("figure")?.querySelector("figcaption")?.textContent?.trim()) }; }));
            expect(media.length).toBeGreaterThan(0); for (const image of media) { expect(image.loaded).toBe(true); expect(image.width).toBeLessThanOrEqual(image.viewport); expect(image.caption).toBe(true); }
            let faq = "NOT_PRESENT_NOT_REQUIRED";
            if (input.name === "A") { const summary = page.locator(".faq details summary").first(); await summary.click(); expect(await page.locator(".faq details[open] p").first().isVisible()).toBe(true); await summary.focus(); await page.keyboard.press("Enter"); expect(await page.locator(".faq details[open]").count()).toBe(0); faq = "CLICK_OPEN_KEYBOARD_ENTER_CLOSE"; }
            const motion = await page.evaluate(() => ({ preference: matchMedia("(prefers-reduced-motion: reduce)").matches, scroll: getComputedStyle(document.documentElement).scrollBehavior, durations: [...document.querySelectorAll(".reveal")].map(node => getComputedStyle(node).animationDuration) }));
            expect(motion.preference).toBe(true); expect(motion.scroll).toBe("auto"); for (const duration of motion.durations) expect(parseFloat(duration)).toBeLessThanOrEqual(0.00001);
            if (viewport.width === 390) {
              const menu = page.locator("details.mobile-nav"); const summary = menu.locator(":scope > summary"); await summary.click();
              const target = await summary.boundingBox(); expect(target!.width).toBeGreaterThanOrEqual(24); expect(target!.height).toBeGreaterThanOrEqual(24);
              await summary.focus(); await page.keyboard.press("Escape"); expect(await menu.getAttribute("open")).toBeNull(); expect(await summary.evaluate(node => document.activeElement === node)).toBe(true);
            }
            await page.screenshot({ path: join(destination, `REF-${input.name}-${viewport.width}-assembled.png`), fullPage: true });
            expect(errors).toEqual([]);
            observations.push({ viewport, crawl, clickedJourney: input.journey, toc: fragment, faq, media, reducedMotion: motion, rootEscapeFocus: viewport.width === 390 ? "PASS" : "NOT_APPLICABLE_DESKTOP", adState: "DISABLED_NO_SLOT", javascriptErrors: errors, blockedExternalRequests: blocked });
            console.log(`REF-${input.name} ${viewport.width} PASS actualJourney=${input.journey.join(" -> ")}; linkcrawl/TOC/media/overflow/reducedMotion; FAQ=${faq}; JSerrors0`);
          } finally { await context.close(); }
        }
        if (input.name === "A") {
          const definition = { enabled: true, instanceId: "synthetic-home-1", publicSlotId: "synthetic-public-home", width: 728, height: 90 };
          adsConfig.enabled = true; adsConfig.placements["home-primary"] = definition;
          const container = await AstroContainer.create(); const wrapper = await container.renderToString(AdSlot, { props: { placement: "home-primary" } });
          const provider = await container.renderToString(TestAdProvider, { props: { placement: "home-primary", definition } });
          expect(provider).toContain('data-ad-instance="synthetic-home-1"');
          const original = readFileSync(join(source, "index.html"), "utf8");
          const seam = original.indexOf("</section>", original.indexOf('class="game-hero')); expect(seam).toBeGreaterThan(0);
          for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) for (const state of ["empty", "synthetic"] as const) {
            // Existing render-container composition seam, inserted at the unchanged homepage's post-Hero position.
            // This is NOT a final ads-enabled build, filled creative, real delivery or viewability proof.
            const slot = state === "empty" ? wrapper : wrapper.replace("</section>", `${provider}</section>`);
            const body = original.slice(0, seam + 10) + slot + original.slice(seam + 10);
            const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
            const blocked: string[] = [];
            try {
              await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== base) { blocked.push(url.href); return route.abort(); } if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body }); return route.continue(); });
              await context.addInitScript(() => { (window as unknown as { qaShifts: number[] }).qaShifts = []; new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) (window as unknown as { qaShifts: number[] }).qaShifts.push((entry as PerformanceEntry & { value: number }).value); }).observe({ type: "layout-shift", buffered: true }); });
              const page = await context.newPage(); await page.goto(base, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
              const geometry = await page.locator('.ad-slot[data-ad-placement="home-primary"]').evaluate(node => { const rect = node.getBoundingClientRect(); const before = node.previousElementSibling?.getBoundingClientRect(); const after = node.nextElementSibling?.getBoundingClientRect(); return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, viewport: innerWidth, clearOfHero: Boolean(before && rect.top >= before.bottom - 1), clearOfFollowingSection: Boolean(after && rect.bottom <= after.top + 1), label: node.getAttribute("aria-label"), providerRoots: node.querySelectorAll("[data-ad-instance]").length }; });
              expect(geometry.width).toBeGreaterThan(0); expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1); expect(geometry.left).toBeGreaterThanOrEqual(-1); expect(geometry.height).toBeCloseTo(geometry.width * 90 / 728, 0); expect(geometry.clearOfHero).toBe(true); expect(geometry.clearOfFollowingSection).toBe(true); expect(geometry.label).toBe("Advertisement"); expect(geometry.providerRoots).toBe(state === "synthetic" ? 1 : 0);
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
              const shifts = await page.evaluate(() => (window as unknown as { qaShifts: number[] }).qaShifts);
              await page.screenshot({ path: join(destination, `REF-A-${viewport.width}-ad-${state}.png`), fullPage: true });
              observations.push({ viewport, adState: state, geometry, observedLayoutShiftValues: shifts, blockedExternalRequests: blocked, realDelivery: "NOT_RUN", viewability: "NOT_RUN", finalAdsEnabledBuild: "NOT_RUN" });
              console.log(`REF-A ${viewport.width} ad ${state} geometry=${JSON.stringify(geometry)}; observed initialLoad shiftSum=${shifts.reduce((sum, value) => sum + value, 0)}; no realAd delivery/viewability claim`);
            } finally { await context.close(); }
          }
        }
        }
        expect((await fetch(`${base}/unknown-assembly/`, { signal: AbortSignal.timeout(3000) })).status).toBe(404);
        writeFileSync(join(destination, `REF-${input.name}-assembly-observations.json`), JSON.stringify({ sourceDirectory: source, sourceOutputSha256: sourceIdentity, browser: browser.version(), playwright: "1.63.0", observations, remaining: ["Human", "Safari", "AX", "full supported-engine coverage", "real ad delivery/viewability", "full Reference acceptance"] }, null, 2));
      } finally { await browser.close(); }
      expect(identity(source)).toBe(sourceIdentity); expect(identity(join(fixture, "dist"))).toBe(sourceIdentity);
    } finally {
      adsConfig.enabled = originalEnabled; adsConfig.placements = originalPlacements;
      try {
        if (attempted) { const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixture, encoding: "utf8", timeout: 15_000 }); console.log(`REF-${input.name} assembly stop exit=${stopped.status}\n${stopped.stdout}\n${stopped.stderr}`); expect(stopped.error).toBeUndefined(); expect(stopped.status).toBe(0); expect(pid).toBeDefined(); for (let retry = 0; pid && alive(pid) && retry < 30; retry++) await pause(100); expect(alive(pid!)).toBe(false); }
      } catch (error) { cleanupError = error; if (pid && alive(pid)) { process.kill(pid, "SIGTERM"); for (let retry = 0; alive(pid) && retry < 30; retry++) await pause(100); if (alive(pid)) process.kill(pid, "SIGKILL"); console.error("Assembly cleanup FAILED: owned fallback termination."); } }
      finally { cleanupCoreBuildFixture(fixture); expect(existsSync(fixture)).toBe(false); console.log(`REF-${input.name} assembly owned fixture removed: ${fixture}`); }
      if (cleanupError) throw cleanupError;
    }
  }, 120_000);
});

describe("REF-A actual ads-enabled build contract", () => {
  it.skipIf(!adsOnly || !inputs[0].directory || !outputDirectory)(offlineAds ? "verifies the offline synthetic provider build and layout" : "rejects an absent provider and checks the original synthetic provider", async () => {
    const destination = realpathSync(outputDirectory!);
    const accepted = realpathSync(inputs[0].directory!);
    for (const directory of [destination, accepted]) if (!relative(process.cwd(), directory).startsWith("../")) throw new Error("Ads evidence must remain outside source project.");
    const acceptedIdentity = identity(accepted);
    expect(acceptedIdentity).toBe("722b3b4c836d9a0fc0ee79103c0e8f3da52f005820be4a42589ad592cb4975f5");
    const original = readFileSync("tests/reference-a.test.ts", "utf8");
    const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
    expect(digest(original)).toBe("8569692654f30d3f3b9d2ef64c4fe4dfd6ac5b9ac7f8c6fa9b490a5b26bde803");
    const boundary = 'describe("REF-A synthetic seed through existing Starter consumers", () => {';
    expect(original.split(boundary)).toHaveLength(2);
    const prefix = original.slice(0, original.indexOf(boundary));
    const replaceOnce = (source: string, from: string, to: string) => {
      expect(source.split(from)).toHaveLength(2);
      return source.replace(from, to);
    };
    const provider = readFileSync("tests/fixtures/ads/TestAdProvider.astro");
    const results: Record<string, unknown>[] = [];
    let negativeInputs: unknown = offlineAds ? JSON.parse(readFileSync("/var/folders/sx/0vw4jt396yj64d3ydl1qls9h0000gn/T/v27-plan57-jd4w65nt/ads-evidence/negative/input-identities.json", "utf8")) : undefined;
    const modes = offlineAds ? ["offline"] as const : ["negative", "synthetic-provider"] as const;
    for (const mode of modes) {
      const evidence = join(destination, mode); mkdirSync(evidence);
      const fixture = createCoreBuildFixture(`starter-reference-ads-${mode}-`);
      let previewPid: number | undefined; let previewAttempted = false; let cleanupError: unknown;
      try {
        for (const path of ["vitest.config.ts", "tests/helpers/core-build-fixture.ts", "tests/fixtures/reference-media"]) cpSync(path, join(fixture, path), { recursive: true });
        const vitestPath = join(fixture, "vitest.config.ts");
        writeFileSync(vitestPath, replaceOnce(readFileSync(vitestPath, "utf8"), "oxc:", 'cacheDir: "./.vitest-cache",\n    oxc:'));
        const adsPath = join(fixture, "src/config/ads.ts");
        writeFileSync(adsPath, replaceOnce(readFileSync(adsPath, "utf8"),
          'export const adsConfig: AdsConfig = defineAdsConfig({\n  enabled: false,\n  placements: {},\n});',
          'export const adsConfig: AdsConfig = defineAdsConfig({\n  enabled: true,\n  placements: { "home-primary": { enabled: true, instanceId: "synthetic-home-1", publicSlotId: "synthetic-public-home", width: 728, height: 90 } },\n});'));
        if (mode === "synthetic-provider") writeFileSync(join(fixture, "src/components/ads/ProjectAd.astro"), provider);
        if (mode === "offline") {
          // Temporary project-authored offline provider, not the original external-bootstrap fixture.
          const offlineProvider = '---\nimport type { AdPlacement, AdPlacementDefinition } from "../../config/ads";\nconst { placement, definition } = Astro.props as { placement: AdPlacement; definition: AdPlacementDefinition };\n---\n<div data-ad-instance={definition.instanceId} data-public-slot-id={definition.publicSlotId} data-ad-provider-fixture={placement}></div>\n';
          writeFileSync(join(fixture, "src/components/ads/ProjectAd.astro"), offlineProvider);
          writeFileSync(join(evidence, "offline-provider-source.txt"), offlineProvider);
        }
        let temporary = prefix;
        if (mode === "offline") temporary = replaceOnce(temporary, 'REF-A S2 final output SHA256:', 'REF-A offline evidence output SHA256:');
        if (mode === "negative") {
          temporary = replaceOnce(temporary, 'expect(build.status).toBe(0);', 'expect(build.status).toBe(1);\n  expect(buildLog).toContain("[/] Ad placement home-primary requires exactly one provider instance; found 0.");');
          temporary = replaceOnce(temporary, 'REF-A S2 final output SHA256:', 'REF-A expected-negative raw output SHA256:');
        }
        // Keep the original input builder, validation and cleanup; replace only its result assertions.
        temporary += `describe("temporary REF-A ads ${mode}", () => { it("checks actual generated ads contract", () => {
          const home = html("/");
          expect(home.match(/data-ad-placement="home-primary"/g)).toHaveLength(1);
          expect((home.match(/data-ad-instance=/g) ?? []).length).toBe(${mode === "negative" ? 0 : 1});
          expect(existsSync(join(fixtureRoot, "dist/EVIDENCE_BUILD_NOT_FINAL.json"))).toBe(${mode !== "negative"});
          ${mode === "negative" ? '' : 'expect(home).toContain(\'data-ad-instance="synthetic-home-1"\'); expect(home).toContain(\'data-public-slot-id="synthetic-public-home"\'); expect(JSON.parse(readFileSync(join(fixtureRoot, "dist/EVIDENCE_BUILD_NOT_FINAL.json"), "utf8"))).toMatchObject({ final: false, mode: "evidence" }); expect(collectOutputReconciliationErrors(catalog, join(fixtureRoot, "dist"))).toEqual([]);'}
          ${mode === "offline" ? 'expect(home).not.toContain(\'data-ad-bootstrap\'); expect(home).not.toContain(\'https://ads.test.invalid/bootstrap.js\');' : mode === "synthetic-provider" ? 'expect(home).toContain(\'data-ad-bootstrap="fixture-bootstrap"\');' : ''}
          const inputPaths = ["game.config.ts", "src/data/page-inventory.json", "src/data/facts/items.json", "src/data/facts/maps.json", "src/content/guides/relay-overview.mdx", "src/content/guides/source-check.mdx", "src/data/media/media.json", "docs/MEDIA_DECISION_TABLE.md", "public/media/relay-cover.svg", "public/media/relay-figure.svg", "public/media/ref-a-ui.png"];
          writeFileSync(join(process.env.V27_REF_A_EVIDENCE_DIR!, "input-identities.json"), JSON.stringify(Object.fromEntries(inputPaths.map(path => [path, createHash("sha256").update(readFileSync(join(fixtureRoot, path))).digest("hex")])), null, 2));
        }); });\n`;
        writeFileSync(join(fixture, "tests/reference-assembly-browser.test.ts"), temporary);
        writeFileSync(join(evidence, "temporary-test-source.txt"), temporary);
        const environment: NodeJS.ProcessEnv = { ...process.env, V27_REF_A_EVIDENCE_DIR: evidence };
        delete environment.V27_REF_A_CAPTURE;
        const run = spawnSync("npm", ["exec", "--", "vitest", "run", "tests/reference-assembly-browser.test.ts", "--disableConsoleIntercept"], { cwd: fixture, env: environment, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
        const log = `${run.stdout}\n${run.stderr}`;
        writeFileSync(join(evidence, "actual-build-test.log"), log);
        console.log(`REF-A ads ${mode} targeted child test exit=${run.status}\n${log}`);
        expect(run.error).toBeUndefined(); expect(run.status).toBe(0);
        expect(log).toContain("REF-A temporary fixture removed.");
        const inner = log.match(/REF-A fixture: (.+)/)?.[1]?.trim(); expect(inner).toBeDefined(); expect(existsSync(inner!)).toBe(false);
        const actualInputs = JSON.parse(readFileSync(join(evidence, "input-identities.json"), "utf8"));
        if (mode === "negative") negativeInputs = actualInputs; else expect(actualInputs).toEqual(negativeInputs);
        const generated = join(evidence, "generated-output"); const outputIdentity = identity(generated);
        const observation: Record<string, unknown> = { mode, acceptedOutputSha256: acceptedIdentity, sourceRefATestSha256: digest(original), reusedPrefixSha256: digest(prefix), temporaryTestSha256: digest(temporary), outputSha256: outputIdentity, providerSha256: digest(readFileSync(join(fixture, "src/components/ads/ProjectAd.astro"))), targetedChildTestExit: run.status, buildExit: mode === "negative" ? 1 : 0, finalMarker: mode !== "negative", strictFinalValidation: "BLOCKED by two unchanged Human/visual pending errors", inputIdentities: actualInputs };
        results.push(observation);
        writeFileSync(join(destination, "ads-contract-observations.json"), JSON.stringify(results, null, 2));
        if (mode === "negative") continue;
        cpSync(generated, join(fixture, "dist"), { recursive: true });
        const port = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); if (!address || typeof address === "string") { server.close(); reject(new Error("No reserved port")); return; } server.close(error => error ? reject(error) : resolve(address.port)); }); });
        previewAttempted = true;
        const started = spawnSync("npm", ["run", "preview", "--", "--background", "--host", "127.0.0.1", "--port", String(port)], { cwd: fixture, encoding: "utf8", timeout: 30_000 });
        previewPid = Number(started.stdout?.match(/\(pid (\d+)\)/)?.[1]) || undefined;
        console.log(`REF-A ads preview start exit=${started.status}\n${started.stdout}\n${started.stderr}`);
        expect(started.error).toBeUndefined(); expect(started.status).toBe(0); expect(previewPid).toBeDefined();
        const base = `http://127.0.0.1:${port}`; expect(started.stdout).toContain(base);
        const browser = await chromium.launch({ headless: true });
        const browserObservations: unknown[] = [];
        try {
          observation.chromium = browser.version(); observation.playwright = "1.63.0";
          for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
            const blocked: string[] = []; const errors: string[] = [];
            try {
              await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== base && ["http:", "https:"].includes(url.protocol)) { blocked.push(url.href); return route.abort(); } return route.continue(); });
              await context.addInitScript(() => { (window as unknown as { qaShifts: number[] }).qaShifts = []; new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) (window as unknown as { qaShifts: number[] }).qaShifts.push((entry as PerformanceEntry & { value: number }).value); }).observe({ type: "layout-shift", buffered: true }); });
              const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
              expect((await page.goto(base, { waitUntil: "networkidle" }))?.status()).toBe(200);
              await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
              const slot = page.locator('.ad-slot[data-ad-placement="home-primary"]'); expect(await slot.count()).toBe(1);
              const geometry = await slot.evaluate(node => { const rect = node.getBoundingClientRect(); const before = node.previousElementSibling?.getBoundingClientRect(); const after = node.nextElementSibling?.getBoundingClientRect(); const root = node.querySelector('[data-ad-instance]'); const providerRect = root?.getBoundingClientRect(); return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, viewport: innerWidth, clearOfHero: Boolean(before && node.previousElementSibling?.classList.contains("game-hero") && rect.top >= before.bottom - 1), clearOfFollowingSection: Boolean(after && rect.bottom <= after.top + 1), label: node.getAttribute("aria-label"), providerRoots: node.querySelectorAll("[data-ad-instance]").length, instanceId: root?.getAttribute("data-ad-instance"), publicSlotId: root?.getAttribute("data-public-slot-id"), providerWidth: providerRect?.width, providerHeight: providerRect?.height, providerText: root?.textContent?.trim(), providerChildren: root?.children.length }; });
              expect(geometry.width).toBeGreaterThan(0); expect(geometry.width).toBeLessThanOrEqual(728); expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1); expect(geometry.left).toBeGreaterThanOrEqual(-1);
              expect(geometry.height).toBeCloseTo(geometry.width * 90 / 728, 0); expect(geometry.clearOfHero).toBe(true); expect(geometry.clearOfFollowingSection).toBe(true); expect(geometry.label).toBe("Advertisement");
              expect(geometry.providerRoots).toBe(1); expect(geometry.instanceId).toBe("synthetic-home-1"); expect(geometry.publicSlotId).toBe("synthetic-public-home"); expect(geometry.providerText).toBe(""); expect(geometry.providerChildren).toBe(0);
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
              if (mode === "offline") expect(blocked).toEqual([]); else expect(blocked).toContain("https://ads.test.invalid/bootstrap.js"); expect(errors).toEqual([]);
              const shifts = await page.evaluate(() => (window as unknown as { qaShifts: number[] }).qaShifts);
              browserObservations.push({ viewport, geometry, observedInitialLayoutShiftValues: shifts, boundedWindow: "navigation through fonts.ready/networkidle +250ms; not field CLS", blockedExternalRequests: blocked, javascriptErrors: errors, creative: "EMPTY_UNFILLED", externalBootstrap: mode === "offline" ? "NOT_RUN absent by design" : "REQUEST_BLOCKED", realDelivery: "NOT_RUN", viewability: "NOT_RUN", human: "PENDING" });
              console.log(`REF-A actual built ads ${viewport.width} geometry=${JSON.stringify(geometry)}; boundedShifts=${JSON.stringify(shifts)}; blocked=${JSON.stringify(blocked)}; JSerrors=${errors.length}`);
            } finally { await context.close(); }
          }
        } finally { await browser.close(); }
        observation.browserObservations = browserObservations;
        expect(identity(generated)).toBe(outputIdentity); expect(identity(join(fixture, "dist"))).toBe(outputIdentity);
        writeFileSync(join(destination, "ads-contract-observations.json"), JSON.stringify(results, null, 2));
      } finally {
        try {
          if (previewAttempted) { const stopped = spawnSync("npm", ["run", "preview", "--", "stop"], { cwd: fixture, encoding: "utf8", timeout: 15_000 }); console.log(`REF-A ads preview stop exit=${stopped.status}\n${stopped.stdout}\n${stopped.stderr}`); expect(stopped.error).toBeUndefined(); expect(stopped.status).toBe(0); expect(previewPid).toBeDefined(); for (let retry = 0; previewPid && alive(previewPid) && retry < 30; retry++) await pause(100); expect(alive(previewPid!)).toBe(false); }
        } catch (error) { cleanupError = error; if (previewPid && alive(previewPid)) { process.kill(previewPid, "SIGTERM"); for (let retry = 0; alive(previewPid) && retry < 30; retry++) await pause(100); if (alive(previewPid)) process.kill(previewPid, "SIGKILL"); console.error("Ads cleanup FAILED: owned fallback termination."); } }
        finally { cleanupCoreBuildFixture(fixture); expect(existsSync(fixture)).toBe(false); console.log(`REF-A ads ${mode} owned outer fixture removed: ${fixture}`); }
        if (cleanupError) throw cleanupError;
      }
    }
    expect(identity(accepted)).toBe(acceptedIdentity);
    expect(digest(readFileSync("tests/reference-a.test.ts"))).toBe(digest(original));
    expect(digest(readFileSync("tests/fixtures/ads/TestAdProvider.astro"))).toBe(digest(provider));
  }, 420_000);
});
