import { gunzipSync } from "node:zlib";

export const PAGEFIND_VERSION = "1.5.2";
export const PAGEFIND_BUDGET_BYTES = 800_000;
export const PAGEFIND_OPTIONAL_UI_FILES = [
  "pagefind-ui.js",
  "pagefind-ui.css",
  "pagefind-component-ui.js",
  "pagefind-component-ui.css",
  "pagefind-modular-ui.js",
  "pagefind-modular-ui.css",
  "pagefind-highlight.js",
] as const;

export interface PagefindArtifactCategories {
  loader: number;
  worker: number;
  entry: number;
  metadata: number;
  wasm: number;
  indexes: number;
  filters: number;
  fragments: number;
}

export interface PagefindLocaleDiagnostics {
  locale: string;
  pageCount: number;
  metadata: number;
  wasm: number;
  indexes: number;
  filters: number;
  fragments: number;
  total: number;
}

export interface PagefindArtifactReport {
  version?: string;
  rawTotalBytes: number;
  optionalUiBytes: number;
  normalizedRequiredBytes: number;
  optionalUiFiles: string[];
  requiredFiles: string[];
  categories: PagefindArtifactCategories;
  locales: PagefindLocaleDiagnostics[];
  errors: string[];
}

export interface PagefindArtifactFile {
  path: string;
  bytes: number;
  content?: Uint8Array;
}

export interface ClassifyPagefindArtifactsInput {
  installedVersion: string;
  manifestSource?: string;
  files: PagefindArtifactFile[];
  directories: string[];
  discoveryErrors?: string[];
}

interface PagefindLanguageManifest {
  hash: string;
  wasm: string | null;
  page_count: number;
}

interface PagefindManifest {
  version: string;
  languages: Record<string, PagefindLanguageManifest>;
  include_characters: string[];
}

const optionalUiSet = new Set<string>(PAGEFIND_OPTIONAL_UI_FILES);
const allowedDirectories = new Set(["filter", "fragment", "index"]);

function emptyCategories(): PagefindArtifactCategories {
  return {
    loader: 0,
    worker: 0,
    entry: 0,
    metadata: 0,
    wasm: 0,
    indexes: 0,
    filters: 0,
    fragments: 0,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pagefindContractReview(message: string): string {
  return `${message} Pagefind ${PAGEFIND_VERSION} contract review is required.`;
}

type CborValue = string | number | boolean | null | CborValue[];

class CborReader {
  private offset = 0;

  constructor(private readonly source: Uint8Array) {}

  get complete(): boolean {
    return this.offset === this.source.length;
  }

  private readByte(): number {
    if (this.offset >= this.source.length) throw new Error("unexpected end of CBOR data");
    return this.source[this.offset++];
  }

  private readLength(additional: number): number {
    if (additional < 24) return additional;
    const byteCount = additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : 0;
    if (byteCount === 0) throw new Error(`unsupported CBOR length encoding ${additional}`);
    let value = 0;
    for (let index = 0; index < byteCount; index += 1) value = value * 256 + this.readByte();
    return value;
  }

  readValue(): CborValue {
    const initial = this.readByte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    const length = this.readLength(additional);
    if (major === 0) return length;
    if (major === 3) {
      const end = this.offset + length;
      if (end > this.source.length) throw new Error("unexpected end of CBOR text data");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(this.source.subarray(this.offset, end));
      this.offset = end;
      return value;
    }
    if (major === 4) return Array.from({ length }, () => this.readValue());
    if (major === 7 && (additional === 20 || additional === 21 || additional === 22)) {
      return additional === 20 ? false : additional === 21 ? true : null;
    }
    throw new Error(`unsupported CBOR major type ${major}`);
  }
}

interface PagefindMetadataReferences {
  fragments: string[];
  indexes: string[];
  filters: string[];
}

export function readPagefindCbor(source: Uint8Array): CborValue {
  const compressed = Buffer.from(source);
  const decoded = compressed[0] === 0x1f && compressed[1] === 0x8b ? gunzipSync(compressed) : compressed;
  if (decoded.subarray(0, 12).toString("utf8") !== "pagefind_dcd") throw new Error("missing pagefind_dcd signature");
  const reader = new CborReader(decoded.subarray(12));
  const value = reader.readValue();
  if (!reader.complete) throw new Error("unexpected trailing CBOR data");
  return value;
}

function parseMetadataReferences(
  source: Uint8Array | undefined,
  locale: string,
  expectedPageCount: number,
  errors: string[],
): PagefindMetadataReferences | undefined {
  try {
    if (!source) throw new Error("metadata bytes are unavailable");
    const compressed = Buffer.from(source);
    const decoded = compressed[0] === 0x1f && compressed[1] === 0x8b
      ? gunzipSync(compressed)
      : compressed;
    if (decoded.subarray(0, 12).toString("utf8") !== "pagefind_dcd") {
      throw new Error("missing pagefind_dcd signature");
    }
    const reader = new CborReader(decoded.subarray(12));
    const metadata = reader.readValue();
    if (!reader.complete) throw new Error("unexpected trailing CBOR data");
    if (!Array.isArray(metadata) || metadata.length !== 6) {
      throw new Error("metadata root must contain six fields");
    }
    const [version, pages, indexChunks, filters, sorts, metaFields] = metadata;
    if (version !== PAGEFIND_VERSION) throw new Error(`unsupported metadata version ${String(version)}`);
    if (!Array.isArray(pages) || pages.length !== expectedPageCount) {
      throw new Error(
        `metadata declares ${Array.isArray(pages) ? pages.length : "invalid"} pages but manifest declares ${expectedPageCount}`,
      );
    }
    if (!Array.isArray(indexChunks) || !Array.isArray(filters) || !Array.isArray(sorts) || !Array.isArray(metaFields)) {
      throw new Error("metadata collections are invalid");
    }
    const hashPattern = new RegExp(`^${escapeRegExp(locale)}_[0-9a-f]+$`, "i");
    const pageHashes = pages.map((page) => {
      if (!Array.isArray(page) || page.length !== 2 || typeof page[0] !== "string" ||
        !hashPattern.test(page[0]) || !Number.isInteger(page[1]) || Number(page[1]) < 0) {
        throw new Error("metadata page declaration is invalid");
      }
      return page[0];
    });
    const indexHashes = indexChunks.map((chunk) => {
      if (!Array.isArray(chunk) || chunk.length !== 3 ||
        chunk.some((value) => typeof value !== "string") || !hashPattern.test(chunk[2] as string)) {
        throw new Error("metadata index declaration is invalid");
      }
      return chunk[2] as string;
    });
    const filterHashes = filters.map((filter) => {
      if (!Array.isArray(filter) || filter.length !== 2 ||
        filter.some((value) => typeof value !== "string") || !hashPattern.test(filter[1] as string)) {
        throw new Error("metadata filter declaration is invalid");
      }
      return filter[1] as string;
    });
    if (indexHashes.length === 0) throw new Error("metadata declares no index chunks");
    if (sorts.some((sort) => !Array.isArray(sort) || sort.length !== 2 || typeof sort[0] !== "string" ||
      !Array.isArray(sort[1]) || sort[1].some((page) => !Number.isInteger(page) || Number(page) < 0))) {
      throw new Error("metadata sort declaration is invalid");
    }
    if (metaFields.some((field) => typeof field !== "string")) {
      throw new Error("metadata fields declaration is invalid");
    }
    return {
      fragments: pageHashes.map((hash) => `fragment/${hash}.pf_fragment`),
      indexes: indexHashes.map((hash) => `index/${hash}.pf_index`),
      filters: filterHashes.map((hash) => `filter/${hash}.pf_filter`),
    };
  } catch (error) {
    errors.push(pagefindContractReview(
      `Required Pagefind metadata is invalid for locale ${locale}: ${error instanceof Error ? error.message : String(error)}.`,
    ));
    return undefined;
  }
}

function parseManifest(manifestSource: string | undefined, errors: string[]): PagefindManifest | undefined {
  if (manifestSource === undefined) {
    errors.push(pagefindContractReview("Required Pagefind artifact is missing: pagefind-entry.json."));
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(manifestSource);
  } catch (error) {
    errors.push(pagefindContractReview(
      `Required Pagefind entry manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    ));
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(pagefindContractReview("Required Pagefind entry manifest must be an object."));
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const topLevelKeys = Object.keys(record).sort();
  if (JSON.stringify(topLevelKeys) !== JSON.stringify(["include_characters", "languages", "version"])) {
    errors.push(pagefindContractReview(
      `Unknown or unsupported Pagefind entry manifest fields: ${topLevelKeys.join(", ") || "(none)"}.`,
    ));
  }
  if (typeof record.version !== "string") {
    errors.push(pagefindContractReview("Required Pagefind entry manifest version is missing or invalid."));
  }
  if (!Array.isArray(record.include_characters) || record.include_characters.some((item) => typeof item !== "string")) {
    errors.push(pagefindContractReview("Required Pagefind include_characters metadata is missing or invalid."));
  }
  if (!record.languages || typeof record.languages !== "object" || Array.isArray(record.languages)) {
    errors.push(pagefindContractReview("Required Pagefind language metadata is missing or invalid."));
    return undefined;
  }

  const languages: Record<string, PagefindLanguageManifest> = {};
  for (const [locale, definition] of Object.entries(record.languages as Record<string, unknown>)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(locale)) {
      errors.push(pagefindContractReview(`Unsupported Pagefind locale identity: ${locale}.`));
      continue;
    }
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      errors.push(pagefindContractReview(`Required Pagefind locale metadata is invalid for ${locale}.`));
      continue;
    }
    const language = definition as Record<string, unknown>;
    const keys = Object.keys(language).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["hash", "page_count", "wasm"])) {
      errors.push(pagefindContractReview(`Unknown or unsupported Pagefind locale fields for ${locale}: ${keys.join(", ")}.`));
      continue;
    }
    if (
      typeof language.hash !== "string" ||
      !new RegExp(`^${escapeRegExp(locale)}_[0-9a-f]+$`, "i").test(language.hash) ||
      !(language.wasm === null || (
        typeof language.wasm === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(language.wasm)
      )) ||
      !Number.isInteger(language.page_count) ||
      Number(language.page_count) < 1
    ) {
      errors.push(pagefindContractReview(`Required Pagefind locale metadata is invalid for ${locale}.`));
      continue;
    }
    languages[locale] = language as unknown as PagefindLanguageManifest;
  }
  if (Object.keys(languages).length === 0) {
    errors.push(pagefindContractReview("Required Pagefind language metadata contains no supported locales."));
  }

  return {
    version: typeof record.version === "string" ? record.version : "",
    languages,
    include_characters: Array.isArray(record.include_characters)
      ? record.include_characters.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function classifyPagefindArtifacts({
  installedVersion,
  manifestSource,
  files,
  directories,
  discoveryErrors = [],
}: ClassifyPagefindArtifactsInput): PagefindArtifactReport {
  const errors = [...discoveryErrors];
  const categories = emptyCategories();
  const rawTotalBytes = files.reduce((total, file) => total + file.bytes, 0);
  const manifest = parseManifest(manifestSource, errors);

  if (installedVersion !== PAGEFIND_VERSION) {
    errors.push(pagefindContractReview(`Unsupported Pagefind installed version ${installedVersion}.`));
  }
  if (manifest?.version !== PAGEFIND_VERSION) {
    errors.push(pagefindContractReview(`Unsupported Pagefind manifest version ${manifest?.version || "(missing)"}.`));
  }
  for (const directory of directories) {
    if (!allowedDirectories.has(directory)) {
      errors.push(pagefindContractReview(`Unknown or unsupported Pagefind directory: ${directory}.`));
    }
  }

  const byPath = new Map(files.map((file) => [file.path, file]));
  const optionalUiFiles = PAGEFIND_OPTIONAL_UI_FILES.filter((file) => byPath.has(file));
  const optionalUiBytes = optionalUiFiles.reduce((total, file) => total + byPath.get(file)!.bytes, 0);
  const requiredFiles = new Set<string>();
  const requireFile = (path: string, category: keyof PagefindArtifactCategories) => {
    const file = byPath.get(path);
    if (!file) {
      errors.push(pagefindContractReview(`Required Pagefind artifact is missing: ${path}.`));
      return 0;
    }
    requiredFiles.add(path);
    categories[category] += file.bytes;
    return file.bytes;
  };

  requireFile("pagefind.js", "loader");
  requireFile("pagefind-worker.js", "worker");
  requireFile("pagefind-entry.json", "entry");

  const locales: PagefindLocaleDiagnostics[] = [];
  const requiredWasmNames = new Set(["unknown"]);
  for (const language of Object.values(manifest?.languages ?? {})) {
    if (language.wasm) requiredWasmNames.add(language.wasm);
  }
  for (const wasm of [...requiredWasmNames].sort()) {
    requireFile(`wasm.${wasm}.pagefind`, "wasm");
  }

  for (const [locale, language] of Object.entries(manifest?.languages ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const metadataPath = `pagefind.${language.hash}.pf_meta`;
    const metadata = requireFile(metadataPath, "metadata");
    const references = parseMetadataReferences(
      byPath.get(metadataPath)?.content,
      locale,
      language.page_count,
      errors,
    );
    const indexes = (references?.indexes ?? []).reduce(
      (total, path) => total + requireFile(path, "indexes"),
      0,
    );
    const filters = (references?.filters ?? []).reduce(
      (total, path) => total + requireFile(path, "filters"),
      0,
    );
    const fragments = (references?.fragments ?? []).reduce(
      (total, path) => total + requireFile(path, "fragments"),
      0,
    );
    const wasmName = language.wasm ?? "unknown";
    const wasm = byPath.get(`wasm.${wasmName}.pagefind`)?.bytes ?? 0;
    locales.push({
      locale,
      pageCount: language.page_count,
      metadata,
      wasm,
      indexes,
      filters,
      fragments,
      total: metadata + wasm + indexes + filters + fragments,
    });
  }

  for (const file of files) {
    if (requiredFiles.has(file.path) || optionalUiSet.has(file.path)) continue;
    errors.push(pagefindContractReview(`Unknown or unsupported Pagefind artifact: ${file.path}.`));
  }

  const normalizedRequiredBytes = Object.values(categories).reduce((total, bytes) => total + bytes, 0);
  return {
    version: manifest?.version,
    rawTotalBytes,
    optionalUiBytes,
    normalizedRequiredBytes,
    optionalUiFiles,
    requiredFiles: [...requiredFiles].sort(),
    categories,
    locales,
    errors,
  };
}

export function collectPagefindBudgetErrors(
  report: PagefindArtifactReport,
  budgetBytes = PAGEFIND_BUDGET_BYTES,
): string[] {
  return report.normalizedRequiredBytes > budgetBytes
    ? [
        `Normalized required Pagefind payload is ${report.normalizedRequiredBytes} B and exceeds the ${budgetBytes} B Starter budget.`,
      ]
    : [];
}

export function formatPagefindDiagnostics(
  report: PagefindArtifactReport,
  rawTotalBytes = report.rawTotalBytes,
  removedOptionalUiBytes = report.optionalUiBytes,
): string {
  const categories = report.categories;
  const localeTotals = report.locales
    .map((locale) =>
      `${locale.locale}=${locale.total} B(meta=${locale.metadata},wasm=${locale.wasm},index=${locale.indexes},filters=${locale.filters},fragments=${locale.fragments})`,
    )
    .join(", ");
  return [
    `raw_total=${rawTotalBytes} B`,
    `removed_optional_ui=${removedOptionalUiBytes} B`,
    `normalized_required=${report.normalizedRequiredBytes} B`,
    `loader=${categories.loader} B`,
    `worker=${categories.worker} B`,
    `entry=${categories.entry} B`,
    `metadata=${categories.metadata} B`,
    `WASM=${categories.wasm} B`,
    `indexes=${categories.indexes} B`,
    `filters=${categories.filters} B`,
    `fragments=${categories.fragments} B`,
    `locale_count=${report.locales.length}`,
    `locales=[${localeTotals}]`,
  ].join("; ");
}
