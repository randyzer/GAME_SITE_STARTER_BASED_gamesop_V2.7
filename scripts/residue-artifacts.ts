import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { gunzipSync } from "node:zlib";

import type { GameConfig } from "../src/config/schema";
import { PAGEFIND_VERSION, readPagefindCbor, type PagefindArtifactReport } from "../src/core/pagefind-artifacts";
import { projectHtmlResidueSurfaces, scanResidueSurfaces, type ResidueSignals, type ResidueSurface } from "./core-safety-sentinels";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const textExtensions = new Set([".svg", ".txt", ".md", ".json", ".xml", ".html", ".csv"]);

export function collectCopiedTextResidueSignals(input: {
  publicDirectory: string;
  readDirectory: string;
  config: GameConfig;
  mediaAssets: Array<{ src: string; poster?: string }>;
  purpose: "final" | "evidence";
}): ResidueSignals {
  const registry = new Set(["favicon.svg", input.config.brand.logoPath?.replace(/^\//, ""),
    ...input.mediaAssets.flatMap(({ src, poster }) => [src, poster]).filter((path): path is string => Boolean(path?.startsWith("/")))
      .map((path) => path.slice(1))].filter((path): path is string => Boolean(path) && textExtensions.has(extname(path!))));
  const errors: string[] = [];
  const surfaces: ResidueSurface[] = [];
  const expected: string[] = [];
  // Inventory only copied public text, never dependency code or arbitrary dist bundles.
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (textExtensions.has(extname(entry.name))) {
        const name = relative(input.publicDirectory, path).split("\\").join("/");
        if (!entry.isFile() || !registry.has(name)) errors.push(`PP-02 unregistered copied public text: ${name}.`);
      }
    }
  };
  try { walk(input.publicDirectory); }
  catch (error) { errors.push(`PP-02 public text inventory unreadable: ${String(error)}.`); }
  for (const path of registry) {
    const isBrandAsset = path === "favicon.svg" || path === input.config.brand.logoPath?.slice(1);
    for (const scope of ["public-text", "url", "branding"] as const) expected.push(`asset:${path}:${scope}`);
    try {
      const source = utf8.decode(readFileSync(join(input.readDirectory, path)));
      if (path.endsWith(".svg")) {
        const projected = projectHtmlResidueSurfaces(`asset:${path}`, source);
        const readable = projected.filter(({ scope }) => scope === "public-text").map(({ text }) => text).join("\n");
        const urls = projected.filter(({ scope }) => scope === "url").map(({ text }) => text).join("\n");
        for (const scope of ["public-text", "url", "branding"] as const) surfaces.push({
          id: `asset:${path}:${scope}`, scope, text: scope === "url" ? urls : scope === "branding" && !isBrandAsset ? "" : readable,
        });
      } else {
        for (const scope of ["public-text", "url", "branding"] as const) surfaces.push({ id: `asset:${path}:${scope}`, scope, text: scope === "branding" && !isBrandAsset ? "" : source });
      }
    } catch (error) { errors.push(`PP-02 required copied text unreadable: ${path}: ${String(error)}.`); }
  }
  const result = scanResidueSurfaces(surfaces, expected, input.purpose, input.config.residueSentinels);
  result.errors.unshift(...errors);
  return result;
}

export function projectPagefindResidueSurfaces(path: string, source: Uint8Array): ResidueSurface[] {
  const values: Array<{ scope: ResidueSurface["scope"]; text: string }> = [];
  const add = (scope: ResidueSurface["scope"], text: string) => values.push({ scope, text });
  if (path.endsWith(".pf_fragment")) {
    const decoded = gunzipSync(source);
    if (utf8.decode(decoded.subarray(0, 12)) !== "pagefind_dcd") throw new Error("Pagefind fragment signature missing");
    const data: unknown = JSON.parse(utf8.decode(decoded.subarray(12)));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Pagefind fragment is not an object");
    const record = data as Record<string, unknown>;
    if (Object.keys(record).sort().join() !== "anchors,content,filters,meta,url,word_count" ||
      typeof record.url !== "string" || typeof record.content !== "string" || !Number.isInteger(record.word_count) ||
      !Array.isArray(record.anchors)) throw new Error("Pagefind 1.5.2 fragment fields changed");
    add("url", record.url);
    add("public-text", record.content);
    add("url", record.content);
    for (const field of ["meta", "filters"] as const) {
      const fields = record[field];
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error(`Pagefind ${field} invalid`);
      for (const [key, value] of Object.entries(fields)) {
        const texts = field === "filters" && Array.isArray(value) ? value : [value];
        if (texts.some((text) => typeof text !== "string")) throw new Error(`Pagefind ${field} text invalid`);
        for (const text of texts as string[]) { add("public-text", text); add("url", text); if (key === "title") add("branding", text); }
      }
    }
    for (const anchor of record.anchors) {
      if (!anchor || typeof anchor !== "object" || Object.keys(anchor).sort().join() !== "element,id,location,text" ||
        typeof anchor.text !== "string" || typeof anchor.id !== "string" || typeof anchor.element !== "string" ||
        !Number.isInteger(anchor.location)) throw new Error("Pagefind anchor fields changed");
      add("public-text", anchor.text); add("url", anchor.text);
    }
  } else if (path.endsWith(".pf_meta")) {
    const metadata = readPagefindCbor(source);
    if (!Array.isArray(metadata) || metadata.length !== 6 || metadata[0] !== PAGEFIND_VERSION) throw new Error("Pagefind metadata contract changed");
    const filters = metadata[3]; const sorts = metadata[4]; const fields = metadata[5];
    if (!Array.isArray(filters) || !Array.isArray(sorts) || !Array.isArray(fields)) throw new Error("Pagefind metadata collections invalid");
    for (const declaration of [...filters, ...sorts]) {
      if (!Array.isArray(declaration) || typeof declaration[0] !== "string") throw new Error("Pagefind declaration invalid");
      add("public-text", declaration[0]); add("url", declaration[0]);
    }
    for (const field of fields) { if (typeof field !== "string") throw new Error("Pagefind meta field invalid"); add("public-text", field); add("url", field); }
  } else if (path.endsWith(".pf_filter")) {
    const filter = readPagefindCbor(source);
    if (!Array.isArray(filter) || filter.length !== 2 || typeof filter[0] !== "string" || !Array.isArray(filter[1])) throw new Error("Pagefind filter contract changed");
    add("public-text", filter[0]); add("url", filter[0]);
    for (const option of filter[1]) {
      if (!Array.isArray(option) || option.length !== 2 || typeof option[0] !== "string" || !Array.isArray(option[1]) ||
        option[1].some((page) => !Number.isInteger(page) || Number(page) < 0)) throw new Error("Pagefind filter option invalid");
      add("public-text", option[0]); add("url", option[0]);
    }
  } else throw new Error("Unregistered Pagefind text artifact");
  // A row is required even when the supported artifact has no optional metadata values.
  if (values.length === 0) add("public-text", "");
  return values.map((value, index) => ({ ...value, id: `pagefind:${path}:${index}` }));
}

export function collectPagefindResidueSignals(input: {
  directory: string; report: PagefindArtifactReport; config: GameConfig; purpose: "final" | "evidence";
}): ResidueSignals {
  const errors: string[] = [...input.report.errors];
  const checked: string[] = [];
  const surfaces: ResidueSurface[] = [];
  const expected = input.report.requiredFiles.filter((path) => /\.pf_(?:meta|fragment|filter)$/.test(path));
  if (input.report.version !== PAGEFIND_VERSION || expected.length === 0) errors.push("PP-02 Pagefind readable coverage unavailable.");
  for (const path of expected) {
    try {
      surfaces.push(...projectPagefindResidueSurfaces(path, readFileSync(join(input.directory, path))));
      checked.push(path);
    } catch (error) { errors.push(`PP-02 Pagefind required text unreadable: ${path}: ${String(error)}.`); }
  }
  const result = scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id), input.purpose, input.config.residueSentinels);
  if (JSON.stringify(checked.sort()) !== JSON.stringify(expected.sort())) errors.push("PP-02 Pagefind required text coverage incomplete.");
  result.errors.unshift(...errors);
  return result;
}
