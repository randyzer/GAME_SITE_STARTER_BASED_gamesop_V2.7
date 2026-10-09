import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  PAGEFIND_BUDGET_BYTES,
  PAGEFIND_OPTIONAL_UI_FILES,
  collectPagefindBudgetErrors,
} from "../src/core/pagefind-artifacts";
import {
  inspectPagefindArtifacts,
  normalizePagefindOutput,
} from "../scripts/normalize-pagefind-output";

interface LocaleFixture {
  hash: string;
  wasm: string | null;
  page_count: number;
}

interface PagefindFixtureOptions {
  languages?: Record<string, LocaleFixture>;
  optionalUi?: boolean;
  requiredBytes?: number;
}

const fixtureRoots: string[] = [];
const optionalUiSizes = [119_987, 14_482, 175_488, 41_830, 14_634, 7_336, 44_352];

function encodeCborLength(majorType: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(majorType << 5) | length]);
  if (length <= 0xff) return Buffer.from([(majorType << 5) | 24, length]);
  if (length <= 0xffff) {
    const encoded = Buffer.alloc(3);
    encoded[0] = (majorType << 5) | 25;
    encoded.writeUInt16BE(length, 1);
    return encoded;
  }
  const encoded = Buffer.alloc(5);
  encoded[0] = (majorType << 5) | 26;
  encoded.writeUInt32BE(length, 1);
  return encoded;
}

function encodeCbor(value: string | number | unknown[]): Buffer {
  if (typeof value === "string") {
    const content = Buffer.from(value);
    return Buffer.concat([encodeCborLength(3, content.length), content]);
  }
  if (typeof value === "number") return encodeCborLength(0, value);
  const entries = value.map((entry) => encodeCbor(entry as string | number | unknown[]));
  return Buffer.concat([encodeCborLength(4, entries.length), ...entries]);
}

function pagefindMetadata(locale: string, pageCount: number): Buffer {
  const fragmentHashes = Array.from(
    { length: pageCount },
    (_, index) => `${locale}_${(index + 1).toString(16).padStart(7, "0")}`,
  );
  const metadata = encodeCbor([
    "1.5.2",
    fragmentHashes.map((hash) => [hash, 100]),
    [["a", "z", `${locale}_abcdef0`]],
    [],
    [],
    ["title"],
  ]);
  return gzipSync(Buffer.concat([Buffer.from("pagefind_dcd"), metadata]), { level: 9 });
}

function writeSizedFile(path: string, bytes: number, content = ""): void {
  mkdirSync(dirname(path), { recursive: true });
  const prefix = Buffer.from(content);
  if (prefix.length > bytes) throw new Error(`${path} content exceeds requested fixture size`);
  writeFileSync(path, Buffer.concat([prefix, Buffer.alloc(bytes - prefix.length, 0x20)]));
}

function writeSizedBuffer(path: string, bytes: number, content: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  if (content.length > bytes) throw new Error(`${path} content exceeds requested fixture size`);
  writeFileSync(path, Buffer.concat([content, Buffer.alloc(bytes - content.length)]));
}

function createPagefindFixture(options: PagefindFixtureOptions = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), "starter-pagefind-contract-"));
  fixtureRoots.push(projectRoot);
  const outputDirectory = join(projectRoot, "dist");
  const pagefindDirectory = join(outputDirectory, "pagefind");
  const languages = options.languages ?? {
    en: { hash: "en_0123456789", wasm: "en", page_count: 1 },
  };
  const manifest = JSON.stringify({
    version: "1.5.2",
    languages,
    include_characters: ["_"],
  });

  mkdirSync(join(projectRoot, "src/components/islands"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/components/islands/SearchIsland.tsx"),
    'const pagefindPath = "/pagefind/pagefind.js";\n',
  );

  mkdirSync(join(projectRoot, "src/core"), { recursive: true });
  writeFileSync(join(projectRoot, "src/core/pagefind-search-adapter.ts"), 'const pagefindPath = "/pagefind/pagefind.js";\n');

  const baseSizes = {
    loader: 45_555,
    worker: 41_255,
    entry: Math.max(300, Buffer.byteLength(manifest)),
    metadata: 823,
    wasm: 213_039,
    indexes: 84_787,
    fragments: 91_902,
  };
  const naturalRequiredBytes = Object.values(baseSizes).reduce((sum, bytes) => sum + bytes, 0);
  const targetRequiredBytes = options.requiredBytes ?? naturalRequiredBytes;
  baseSizes.fragments += targetRequiredBytes - naturalRequiredBytes;
  if (baseSizes.fragments <= 0) throw new Error("requiredBytes fixture is too small");

  writeSizedFile(join(pagefindDirectory, "pagefind.js"), baseSizes.loader);
  writeSizedFile(join(pagefindDirectory, "pagefind-worker.js"), baseSizes.worker);
  writeSizedFile(join(pagefindDirectory, "pagefind-entry.json"), baseSizes.entry, manifest);

  const locales = Object.entries(languages);
  const split = (total: number, index: number, count: number) =>
    Math.floor(total / count) + (index < total % count ? 1 : 0);
  const wasmNames = new Set(["unknown", ...locales.flatMap(([, locale]) => locale.wasm ?? [])]);
  const wasmList = [...wasmNames];
  for (const [index, [locale, definition]] of locales.entries()) {
    writeSizedBuffer(
      join(pagefindDirectory, `pagefind.${definition.hash}.pf_meta`),
      split(baseSizes.metadata, index, locales.length),
      pagefindMetadata(locale, definition.page_count),
    );
    writeSizedFile(
      join(pagefindDirectory, "index", `${locale}_abcdef0.pf_index`),
      split(baseSizes.indexes, index, locales.length),
    );
    for (let fragmentIndex = 0; fragmentIndex < definition.page_count; fragmentIndex += 1) {
      writeSizedFile(
        join(
          pagefindDirectory,
          "fragment",
          `${locale}_${(fragmentIndex + 1).toString(16).padStart(7, "0")}.pf_fragment`,
        ),
        split(
          split(baseSizes.fragments, index, locales.length),
          fragmentIndex,
          definition.page_count,
        ),
      );
    }
  }
  for (const [index, wasm] of wasmList.entries()) {
    writeSizedFile(
      join(pagefindDirectory, `wasm.${wasm}.pagefind`),
      split(baseSizes.wasm, index, wasmList.length),
    );
  }

  if (options.optionalUi) {
    PAGEFIND_OPTIONAL_UI_FILES.forEach((file, index) => {
      writeSizedFile(join(pagefindDirectory, file), optionalUiSizes[index]);
    });
  }

  return { projectRoot, outputDirectory, pagefindDirectory };
}

function inspect(pagefindDirectory: string, installedVersion = "1.5.2") {
  return inspectPagefindArtifacts({ pagefindDirectory, installedVersion });
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
  }
});

describe("Pagefind 1.5.2 artifact contract", () => {
  it("accepts complete single-language output when optional stock UI is already absent", () => {
    const fixture = createPagefindFixture();
    const report = inspect(fixture.pagefindDirectory);

    expect(report.errors).toEqual([]);
    expect(report.optionalUiFiles).toEqual([]);
    expect(report.locales.map((locale) => locale.locale)).toEqual(["en"]);
    expect(report.categories).toMatchObject({
      loader: 45_555,
      worker: 41_255,
      metadata: 823,
      wasm: 213_039,
      indexes: 84_787,
      fragments: 91_902,
    });
  });

  it("accepts every declared fragment and fails when one declared fragment is missing", () => {
    const fixture = createPagefindFixture({
      languages: {
        en: { hash: "en_0123456789", wasm: "en", page_count: 3 },
      },
    });

    expect(inspect(fixture.pagefindDirectory).errors).toEqual([]);

    rmSync(join(fixture.pagefindDirectory, "fragment/en_0000002.pf_fragment"));
    expect(inspect(fixture.pagefindDirectory).errors.join("\n")).toMatch(
      /required.*fragment\/en_0000002\.pf_fragment.*missing|missing.*fragment\/en_0000002\.pf_fragment/i,
    );
  });

  it("preserves complete en, ja, and pt-br locale structures", () => {
    const fixture = createPagefindFixture({
      optionalUi: true,
      languages: {
        en: { hash: "en_1111111111", wasm: "en", page_count: 19 },
        ja: { hash: "ja_2222222222", wasm: null, page_count: 19 },
        "pt-br": { hash: "pt-br_333333333333", wasm: "pt-br", page_count: 19 },
      },
    });
    const normalized = normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    });
    const report = normalized.report;

    expect(report.errors).toEqual([]);
    expect(normalized.removedOptionalUiFiles).toEqual(PAGEFIND_OPTIONAL_UI_FILES);
    expect(report.locales.map((locale) => locale.locale)).toEqual(["en", "ja", "pt-br"]);
    for (const locale of report.locales) {
      expect(locale.metadata).toBeGreaterThan(0);
      expect(locale.wasm).toBeGreaterThan(0);
      expect(locale.indexes).toBeGreaterThan(0);
      expect(locale.fragments).toBeGreaterThan(0);
    }
  });

  it("removes only present exact known optional UI after proving it is unreferenced", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    const normalized = normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    });

    expect(normalized.removedOptionalUiFiles).toEqual(PAGEFIND_OPTIONAL_UI_FILES);
    for (const file of PAGEFIND_OPTIONAL_UI_FILES) {
      expect(existsSync(join(fixture.pagefindDirectory, file))).toBe(false);
    }
    expect(normalized.report.errors).toEqual([]);
  });

  it("treats an already-absent exact optional UI set as valid", () => {
    const fixture = createPagefindFixture();

    expect(() => normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    })).not.toThrow();
  });

  it("fails closed and deletes nothing when present optional UI is referenced", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    writeFileSync(
      join(fixture.outputDirectory, "index.html"),
      '<script src="/pagefind/pagefind-ui.js"></script>',
    );

    expect(() => normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    })).toThrow(/pagefind-ui\.js.*referenced|reference safety/i);
    for (const file of PAGEFIND_OPTIONAL_UI_FILES) {
      expect(existsSync(join(fixture.pagefindDirectory, file))).toBe(true);
    }
  });

  it("fails closed when current Starter search runtime references optional UI", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    writeFileSync(
      join(fixture.projectRoot, "src/components/islands/SearchIsland.tsx"),
      'import("/pagefind/pagefind-component-ui.js");\n',
    );

    expect(() => normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    })).toThrow(/pagefind-component-ui\.js.*referenced|reference safety/i);
  });

  it("fails closed and deletes nothing when the Pagefind adapter references optional UI", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    writeFileSync(join(fixture.projectRoot, "src/core/pagefind-search-adapter.ts"), 'import("/pagefind/pagefind-ui.js");\n');
    expect(() => normalizePagefindOutput({ projectRoot: fixture.projectRoot, outputDirectory: fixture.outputDirectory, installedVersion: "1.5.2" })).toThrow(/pagefind-ui\.js.*referenced|reference safety/i);
    expect(PAGEFIND_OPTIONAL_UI_FILES.every(file => existsSync(join(fixture.pagefindDirectory, file)))).toBe(true);
  });

  it("fails closed when the finite provider adapter source cannot be inspected", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    rmSync(join(fixture.projectRoot, "src/core/pagefind-search-adapter.ts"));
    expect(() => normalizePagefindOutput({ projectRoot: fixture.projectRoot, outputDirectory: fixture.outputDirectory, installedVersion: "1.5.2" })).toThrow(/runtime|adapter|reference safety/i);
    expect(PAGEFIND_OPTIONAL_UI_FILES.every(file => existsSync(join(fixture.pagefindDirectory, file)))).toBe(true);
  });

  it("fails closed when required runtime or locale artifacts are missing", () => {
    const fixture = createPagefindFixture();
    rmSync(join(fixture.pagefindDirectory, "pagefind-worker.js"));
    rmSync(join(fixture.pagefindDirectory, "index/en_abcdef0.pf_index"));

    expect(inspect(fixture.pagefindDirectory).errors.join("\n")).toMatch(
      /required.*pagefind-worker\.js|required.*index.*en/i,
    );
  });

  it("fails closed for unsupported installed or manifest Pagefind versions", () => {
    const fixture = createPagefindFixture();
    expect(inspect(fixture.pagefindDirectory, "1.6.0").errors.join("\n")).toMatch(
      /unsupported Pagefind.*1\.6\.0.*contract review/i,
    );

    const entryPath = join(fixture.pagefindDirectory, "pagefind-entry.json");
    const entry = readFileSync(entryPath, "utf8").replace('"1.5.2"', '"1.6.0"');
    writeFileSync(entryPath, entry);
    expect(inspect(fixture.pagefindDirectory).errors.join("\n")).toMatch(
      /manifest.*1\.6\.0.*contract review/i,
    );
  });

  it("fails closed for unknown structures without fuzzy deletion", () => {
    const fixture = createPagefindFixture({ optionalUi: true });
    writeSizedFile(join(fixture.pagefindDirectory, "pagefind-future-ui.js"), 10);

    expect(() => normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    })).toThrow(/unknown.*pagefind-future-ui\.js.*contract review/i);
    expect(existsSync(join(fixture.pagefindDirectory, "pagefind-future-ui.js"))).toBe(true);
  });

  it("passes normalized required payload at or below 800,000 B", () => {
    const fixture = createPagefindFixture({ requiredBytes: PAGEFIND_BUDGET_BYTES });
    const report = inspect(fixture.pagefindDirectory);

    expect(report.normalizedRequiredBytes).toBe(PAGEFIND_BUDGET_BYTES);
    expect(collectPagefindBudgetErrors(report)).toEqual([]);
  });

  it("fails normalized required payload above 800,000 B", () => {
    const fixture = createPagefindFixture({ requiredBytes: PAGEFIND_BUDGET_BYTES + 1 });
    const report = inspect(fixture.pagefindDirectory);

    expect(collectPagefindBudgetErrors(report).join("\n")).toMatch(
      /normalized required Pagefind payload.*800001.*800000/i,
    );
  });

  it("passes Bomb Farm shape with 895,770 B raw and 477,661 B required", () => {
    const fixture = createPagefindFixture({ optionalUi: true, requiredBytes: 477_661 });
    const report = inspect(fixture.pagefindDirectory);

    expect(report.rawTotalBytes).toBe(895_770);
    expect(report.optionalUiBytes).toBe(418_109);
    expect(report.normalizedRequiredBytes).toBe(477_661);
    expect(collectPagefindBudgetErrors(report)).toEqual([]);
    const normalized = normalizePagefindOutput({
      projectRoot: fixture.projectRoot,
      outputDirectory: fixture.outputDirectory,
      installedVersion: "1.5.2",
    });
    expect(normalized.report.normalizedRequiredBytes).toBe(477_661);
    expect(collectPagefindBudgetErrors(normalized.report)).toEqual([]);
  });
});
