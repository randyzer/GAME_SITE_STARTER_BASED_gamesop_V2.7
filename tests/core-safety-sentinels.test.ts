import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";

import gameConfig from "../game.config";
import { gameConfigSchema } from "../src/config/schema";
import { CORE_SENTINELS, collectSourceResidueSignals, projectHtmlResidueSurfaces, scanResidueSurfaces } from "../scripts/core-safety-sentinels";
import pageInventory from "../src/data/page-inventory.json";
import { parsePageInventory } from "../src/data/schemas/page-inventory";
import { collectCopiedTextResidueSignals, projectPagefindResidueSurfaces } from "../scripts/residue-artifacts";
import { runSiteValidation } from "../scripts/validate-site";
import { collectMediaReadinessSignals, findMediaDecisionTable, parseMediaDecisionTableMarkdown } from "../src/core/media-readiness";
import { adoptFixtureConfig, createCoreBuildFixture, cleanupCoreBuildFixture, runFixtureNpm, writeFixtureGameConfigSource } from "./helpers/core-build-fixture";

describe("PP-02 adoption boundary", () => {
  it("keeps adopted fixture About Core byte-identical to the source", () => {
    const root = createCoreBuildFixture("starter-about-portability-");
    try {
      const source = fileURLToPath(new URL("../src/core/static-page-copy.ts", import.meta.url));
      expect(readFileSync(join(root, "src/core/static-page-copy.ts"))).toEqual(readFileSync(source));
    } finally { cleanupCoreBuildFixture(root); }
  });

  it("scans project-owned About copy without injecting a Starter intro", () => {
    const config = adoptFixtureConfig(gameConfig);
    const inventory = parsePageInventory(pageInventory);
    const original = inventory.find((page) => page.pageType === "about")!;
    const about = {
      ...original,
      title: "About Field Notes Editorial",
      description: "Field Notes publishes independent reference articles with documented sources and corrections.",
      sources: original.sources.map((source) => ({
        ...source,
        sourceUrl: "https://field-notes.example/about/",
        evidenceNote: "Synthetic project editorial scope used for the About adoption regression.",
      })),
    };
    const scan = (description: string) => collectSourceResidueSignals({
      config, pages: [{ ...about, description }], contentEntries: [], legalContent: {}, purpose: "final",
    });
    expect(scan(about.description).errors).toEqual([]);
    const oldIntro = CORE_SENTINELS.find((entry) => entry.id === "core.about-intro")!.literal;
    expect(scan(oldIntro).errors).toContain("PP-02 core.about-intro residue on page:about:copy.");
  });

  it("validates the explicit shipped or adopted project state without bypassing PP-02", () => {
    const root = createCoreBuildFixture("starter-pp02-validation-");
    try {
      const source = readFileSync(join(root, "game.config.ts"), "utf8");
      const serialized = source.match(/^import \{ defineGameConfig \} from "\.\/src\/config\/schema";\n\nexport default defineGameConfig\((\{[\s\S]*\})\);\n$/);
      expect(serialized).not.toBeNull();
      const fixtureConfig = gameConfigSchema.parse(JSON.parse(serialized![1]));
      expect(fixtureConfig.brand.name).toBe("Field Notes");
      expect(fixtureConfig.site.url).toBe("https://field-notes.example");
      const adopted = runFixtureNpm(root, "validate");
      expect(adopted.error).toBeUndefined();
      expect(adopted.status, `${adopted.stdout}\n${adopted.stderr}`).toBe(0);

      // Own the negative input rather than treating every real adoption as unadopted.
      const unadopted = gameConfigSchema.parse({
        ...fixtureConfig,
        brand: { ...fixtureConfig.brand, name: "Game Atlas" },
        site: { ...fixtureConfig.site, url: "https://gameatlas.example" },
      });
      writeFixtureGameConfigSource(root, JSON.stringify(unadopted, null, 2));
      const rejected = runFixtureNpm(root, "validate");
      expect(rejected.error).toBeUndefined();
      expect(rejected.status, `${rejected.stdout}\n${rejected.stderr}`).toBe(1);
      expect(`${rejected.stdout}\n${rejected.stderr}`).toMatch(/PP-02/);
      expect(`${rejected.stdout}\n${rejected.stderr}`).toMatch(/core.brand residue/);
      expect(`${rejected.stdout}\n${rejected.stderr}`).toMatch(/core.domain residue/);
    } finally { cleanupCoreBuildFixture(root); }

    // Check the CLI against the existing final validator for the actual inputs.
    const diagnostics: string[] = [];
    const spies = (["error", "warn", "info", "log"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args) => { diagnostics.push(args.join(" ")); }),
    );
    let expectedStatus: number;
    try { expectedStatus = runSiteValidation(); }
    finally { for (const spy of spies) spy.mockRestore(); }
    const result = spawnSync("npm", ["run", "validate"], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
    for (const diagnostic of diagnostics) {
      expect(`${result.stdout}\n${result.stderr}`).toContain(diagnostic);
    }
    const decisionTable = findMediaDecisionTable(process.cwd());
    expect(decisionTable.errors).toEqual([]);
    if (decisionTable.path) {
      const decisions = parseMediaDecisionTableMarkdown(readFileSync(decisionTable.path, "utf8"));
      expect(decisions.errors).toEqual([]);
      const readiness = collectMediaReadinessSignals({
        inventory: parsePageInventory(pageInventory), decisions: decisions.decisions, purpose: "final",
      });
      if (readiness.errors.length > 0) {
        expect(result.status).toBe(1);
        for (const error of readiness.errors) expect(`${result.stdout}\n${result.stderr}`).toContain(error);
      }
    }
  });

  it("accepts only additive literals in predefined scopes", () => {
    expect(gameConfigSchema.safeParse({
      ...gameConfig,
      residueSentinels: [{ id: "project.old-domain", literal: "old-game.example", surface: "url" }],
    }).success).toBe(true);
    for (const entry of [
      { id: "core.brand", literal: "old-game", surface: "branding" },
      { id: "project.old", literal: "", surface: "public-text" },
      { id: "project.old", literal: " \n\t ", surface: "public-text" },
      { id: "project.old", literal: "old-game", surface: "bundle" },
      { id: "project.old", literal: "old-game", surface: "url", disable: true },
    ]) {
      expect(gameConfigSchema.safeParse({ ...gameConfig, residueSentinels: [entry] }).success).toBe(false);
    }
  });
});

describe("PP-02 closed literal catalog", () => {
  it.each(CORE_SENTINELS)("detects fixed signature $id after whitespace normalization", (entry) => {
    const surfaces = [{ id: "sample", scope: entry.surface, text: entry.literal.replaceAll(" ", "\n\t") }];
    expect(scanResidueSurfaces(surfaces, ["sample"]).errors).toContain(`PP-02 ${entry.id} residue on sample.`);
  });

  it.each(["https://gameatlas.example/", "https://docs.GAMEATLAS.example/", "Visit gameatlas.example for details"])("detects the reserved host: %s", (text) => {
    expect(scanResidueSurfaces([{ id: "url", scope: "url", text }], ["url"]).errors).not.toEqual([]);
  });

  it.each(["https://notgameatlas.example/", "https://gameatlas.example.other.invalid/", "https://gameatlas.example-name.test/"])("allows host lookalikes: %s", (text) => {
    expect(scanResidueSurfaces([{ id: "url", scope: "url", text }], ["url"]).errors).toEqual([]);
  });

  it("allows ordinary words, article quotations and short-name substrings", () => {
    const surfaces = [{ id: "copy", scope: "public-text" as const, text: "Game Atlas called this an Atlas. Add item. Replace item. TODO: review." },
      { id: "title", scope: "branding" as const, text: "Atlas Beetle Guide" }];
    expect(scanResidueSurfaces(surfaces, ["copy", "title"]).errors).toEqual([]);
  });

  it("fails closed on missing, duplicate and unexpected coverage", () => {
    const surface = { id: "one", scope: "public-text" as const, text: "Clean copy" };
    for (const [surfaces, expected] of [[[], ["one"]], [[surface, surface], ["one"]], [[surface], []]] as const) {
      expect(scanResidueSurfaces([...surfaces], [...expected]).errors.join()).toMatch(/coverage/);
    }
  });

  it("limits evidence warnings to ordinary samples", () => {
    const surfaces = CORE_SENTINELS.map((entry) => ({ id: entry.id, scope: entry.surface, text: entry.literal }));
    const result = scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id), "evidence");
    expect(result.warnings.join()).toMatch(/core.brand/);
    expect(result.errors.join()).toMatch(/core.legal-notice/);
    expect(result.errors.join()).toMatch(/core.setup-intro/);
    expect(result.errors.join()).not.toMatch(/core.domain residue/);
  });

  it("checks decoded text, numeric entities, split elements, head metadata and JSON-LD", () => {
    const surfaces = projectHtmlResidueSurfaces("/404.html", `<html><head><title>Field Notes</title><meta property="og:site_name" content="Game&#32;Atlas"><link rel="canonical" href="https://gameatlas&#46;example/404.html"><script type="application/ld+json">{"@type":"WebSite","name":"Game Atlas","url":"https://gameatlas.example"}</script></head><body><p>How to Configure <b>This Game</b> Site Starter</p></body></html>`);
    const result = scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id));
    expect(result.errors.join()).toMatch(/core.setup-title/);
    expect(result.errors.join()).toMatch(/core.brand/);
    expect(result.errors.join()).toMatch(/core.domain/);
  });

  it("does not turn implementation code or comments into public copy", () => {
    const surfaces = projectHtmlResidueSurfaces("/", `<title>Field Notes</title><!-- Game Atlas --><script>const text = "How to Configure This Game Site Starter";</script><style>.GameAtlas{}</style><p>Game Atlas is quoted.</p>`);
    expect(scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id)).errors).toEqual([]);
  });

  it("reads only the confirmed Pagefind 1.5.2 fragment fields", () => {
    const fragment = { url: "/guide/", content: "How to Configure This Game Site Starter", word_count: 8,
      filters: { category: ["Guides"] }, meta: { title: "Game Atlas", description: "A guide" }, anchors: [] };
    const bytes = (value: unknown) => gzipSync(Buffer.from(`pagefind_dcd${JSON.stringify(value)}`));
    const surfaces = projectPagefindResidueSurfaces("fragment/en_a.pf_fragment", bytes(fragment));
    expect(scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id)).errors.join()).toMatch(/core.setup-title/);
    expect(scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id)).errors.join()).toMatch(/core.brand/);
    expect(() => projectPagefindResidueSurfaces("fragment/en_a.pf_fragment", bytes({ ...fragment, future: true }))).toThrow(/fields changed/);
    expect(() => projectPagefindResidueSurfaces("fragment/en_a.pf_fragment", new Uint8Array([0, 1]))).toThrow();
  });

  it.each([
    '<p>How to Configure This Game Site <span>Start</span>er</p>',
    '<p>How to Configure This <em>Game Site</em> Starter</p>',
    '<header><span class="brand__copy"><strong>At<span>la</span>s</strong></span></header>',
    '<a href="https://gameatlas%2eexample/path">A link</a>',
    '<a href="//docs.gameatlas%2eexample/path">A link</a>',
  ])("detects rendered inline text and parsed encoded host: %s", (html) => {
    const surfaces = projectHtmlResidueSurfaces("/", html);
    expect(scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id)).errors).not.toEqual([]);
  });

  it.each([
    "https://gameatlas.example%2eother.invalid/",
    "https://gameatlas.example@field-notes.example/",
    "https://field-notes.example/gameatlas.example/",
  ])("does not mistake URL paths, credentials or encoded host suffixes for the reserved host: %s", (text) => {
    expect(scanResidueSurfaces([{ id: "url", scope: "url", text }], ["url"]).errors).toEqual([]);
  });

  it("allows a brand quotation in registered media text without treating it as site branding", () => {
    const root = createCoreBuildFixture("starter-pp02-media-quote-");
    try {
      writeFileSync(join(root, "public/media/quote.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><text>Game Atlas is quoted as a reference.</text></svg>');
      const manifest = JSON.parse(readFileSync(join(root, "src/data/media/media.json"), "utf8")) as { assets: Array<{ src: string; poster?: string }> };
      const source = readFileSync(join(root, "game.config.ts"), "utf8");
      const serialized = source.match(/^import \{ defineGameConfig \} from "\.\/src\/config\/schema";\n\nexport default defineGameConfig\((\{[\s\S]*\})\);\n$/);
      expect(serialized).not.toBeNull();
      const fixtureConfig = gameConfigSchema.parse(JSON.parse(serialized![1]));
      const result = collectCopiedTextResidueSignals({ publicDirectory: join(root, "public"), readDirectory: join(root, "public"),
        config: fixtureConfig, mediaAssets: [...manifest.assets, { src: "/media/quote.svg" }], purpose: "final" });
      expect(result.errors).toEqual([]);
    } finally { cleanupCoreBuildFixture(root); }
  });
});
