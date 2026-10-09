import { realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { resolveShareMetadata } from "../src/core/seo";
import type { ImageAsset } from "../src/data/schemas/media";
import { resolveMediaPresentation } from "../src/core/media-presentation";
import type { GameConfig } from "../src/config/schema";
import type { ResolvedPageMedia } from "../src/data/media/catalog";
import type { MediaAsset } from "../src/data/schemas/media";

const localImageExtensions = /\.(?:png|jpe?g|webp|avif|gif|svg)$/i;
const localMediaExtensions = /\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm)$/i;
const localVideoAdvisoryBytes = 25 * 1024 * 1024;

export function isLocalMediaFile(src: string, publicDirectory: string): boolean {
  if (!src.startsWith("/media/")) return false;
  try {
    const root = join(realpathSync(publicDirectory), "media");
    const file = resolve(root, src.slice("/media/".length));
    return file.startsWith(root + sep) &&
      localMediaExtensions.test(src) &&
      realpathSync(file).startsWith(root + sep) &&
      statSync(file).isFile();
  } catch {
    return false;
  }
}

export function isLocalImageFile(src: string, publicDirectory: string): boolean {
  return localImageExtensions.test(src) && isLocalMediaFile(src, publicDirectory);
}

export function isPublicImageFile(src: string, publicDirectory: string): boolean {
  if (!src.startsWith("/") || src.startsWith("//") || !localImageExtensions.test(src)) {
    return false;
  }

  try {
    const root = realpathSync(publicDirectory);
    const file = resolve(root, src.slice(1));
    return file.startsWith(root + sep) &&
      realpathSync(file).startsWith(root + sep) &&
      statSync(file).isFile();
  } catch {
    return false;
  }
}

export function collectLocalVideoAdvisories(
  assets: MediaAsset[],
  getLocalFileSize: (src: string) => number | undefined,
): string[] {
  return assets.flatMap((asset) => {
    if (asset.type !== "video" || !asset.src.startsWith("/media/")) return [];
    const size = getLocalFileSize(asset.src);
    if (size === undefined || size <= localVideoAdvisoryBytes) return [];

    return [
      `Advisory: local video ${asset.src} is ${(size / 1024 / 1024).toFixed(1)} MiB. This implementation-local heuristic is non-blocking; project budgets and observed delivery behavior remain authoritative.`,
    ];
  });
}

function attributes(tag: string): Map<string, string> {
  const entities: Record<string, string> = { amp: "&", quot: '"', "#39": "'", "#x27": "'", lt: "<", gt: ">" };
  return new Map([...tag.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)].map((match) => [
    match[1].toLowerCase(),
    (match[2] ?? match[3] ?? "").replace(/&(amp|quot|#39|#x27|lt|gt);/g, (_, entity: string) => entities[entity]),
  ]));
}

function openingTags(html: string, name: "img" | "iframe" | "video" | "a" | "meta"): string[] {
  // Astro preserves > inside quoted attributes; it is not a tag boundary there.
  return html.match(new RegExp(`<${name}\\b(?:[^"'<>]|"[^"]*"|'[^']*')*>`, "g")) ?? [];
}

export interface ChromeHtmlValidationConfig {
  logoPath?: string;
}

function normalizeVisibleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tagText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function collectChromeHtmlErrors(
  html: string,
  config: ChromeHtmlValidationConfig,
  localFileExists: (src: string) => boolean,
): string[] {
  const errors: string[] = [];
  let hasHeaderHomeLink = false;

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = attributes(match[1]);
    if (!attrs.get("class")?.split(/\s+/).includes("brand") || attrs.get("href") !== "/") {
      continue;
    }

    hasHeaderHomeLink = true;
    const accessibleName = attrs.get("aria-label")?.trim() || tagText(match[2]);
    if (!accessibleName) {
      errors.push("Header home link requires an accessible name.");
    }
  }

  if (!hasHeaderHomeLink) {
    errors.push("Header home link requires an accessible name.");
  }

  if (!config.logoPath) {
    return errors;
  }

  if (!localFileExists(config.logoPath)) {
    errors.push(`Configured logo file is missing or invalid: ${config.logoPath}`);
  }

  const logoImage = openingTags(html, "img").find((tag) => {
    const attrs = attributes(tag);
    return attrs.get("src") === config.logoPath;
  });

  if (!logoImage) {
    errors.push(`Configured logo does not render: ${config.logoPath}`);
    return errors;
  }

  if (!attributes(logoImage).has("alt")) {
    errors.push("Configured logo image must declare an alt attribute.");
  }

  return errors;
}

export function collectChromeAssetConfigErrors(
  config: Pick<GameConfig, "brand">,
  localFileExists: (src: string) => boolean,
): string[] {
  return config.brand.logoPath && !localFileExists(config.brand.logoPath)
    ? [`Configured logo file is missing or invalid: ${config.brand.logoPath}`]
    : [];
}

export function collectMediaHtmlErrors(
  html: string,
  assets: MediaAsset[],
  localFileExists: (src: string) => boolean,
  expected?: ResolvedPageMedia,
): string[] {
  const errors: string[] = [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const youtubeVideoSources = new Set(
    assets
      .filter((asset) => asset.type === "video" && !asset.src.startsWith("/media/"))
      .map((asset) => `https://www.youtube-nocookie.com/embed/${asset.src}`),
  );

  for (const tag of openingTags(html, "iframe")) {
    const attrs = attributes(tag);
    if (!youtubeVideoSources.has(attrs.get("src") ?? "")) errors.push("Iframe src is not a registered YouTube-nocookie embed.");
    if (!attrs.get("title")?.trim()) errors.push("Iframe requires an accessible title.");
    if (attrs.get("loading") !== "lazy") errors.push("Iframe must load lazily.");
    if (attrs.get("allow") !== "encrypted-media; picture-in-picture; fullscreen" || !attrs.has("allowfullscreen")) errors.push("Iframe permissions/fullscreen contract is invalid.");
    if (attrs.get("referrerpolicy") !== "strict-origin-when-cross-origin" || attrs.has("srcdoc")) errors.push("Iframe privacy contract is invalid.");
  }

  for (const match of html.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g)) {
    const frame = attributes(match[1]);
    const id = frame.get("data-media-id");
    if (!id) continue;
    const asset = byId.get(id);
    if (!asset) {
      errors.push(`Unknown rendered media asset: ${id}`);
      continue;
    }
    const body = match[2];
    const presentation = resolveMediaPresentation(asset);
    const decodeText = (text: string) => attributes(`value="${text.replace(/"/g, "&quot;")}"`).get("value") ?? "";
    if (decodeText(body).includes(asset.rightsRef) || /\bright[s]?Ref\b/.test(body + match[1])) errors.push(`Media ${id} exposes private rights evidence.`);
    if (presentation.publicCredit) {
      const credit = body.match(/<span\b[^>]*class="media-credit"[^>]*>([\s\S]*?)<\/span>/)?.[1];
      if (!credit || normalizeVisibleText(decodeText(tagText(credit))) !== normalizeVisibleText(presentation.publicCredit.text) ||
          (presentation.publicCredit.url && !openingTags(credit, "a").some(tag => attributes(tag).get("href") === presentation.publicCredit!.url))) errors.push(`Media ${id} public credit does not match its asset.`);
    }
    if (!frame.get("class")?.split(/\s+/).includes("game-media")) errors.push(`Media ${id} lacks its responsive figure class.`);
    const sourceLinks = openingTags(body, "a").map((link) => attributes(link).get("href"));
    if (!sourceLinks.includes(asset.sourceUrl)) errors.push(`Media ${id} is missing its provenance link.`);
    if (asset.type === "image") {
      const images = openingTags(body, "img");
      const attrs = attributes(images[0] ?? "");
      if (images.length !== 1 || attrs.get("src") !== asset.src) errors.push(`Media ${id} image src does not match its asset.`);
      if (attrs.get("width") !== String(presentation.dimensions.width) || attrs.get("height") !== String(presentation.dimensions.height)) errors.push(`Media ${id} intrinsic image dimensions do not match its asset.`);
      if (!localFileExists(asset.src)) errors.push(`Media ${id} local image file is missing: ${asset.src}`);
      if (!attrs.has("alt") || attrs.get("alt") !== asset.alt) errors.push(`Media ${id} alt does not match its asset.`);
      if (!["eager", "lazy"].includes(attrs.get("loading") ?? "") || attrs.get("decoding") !== "async") errors.push(`Media ${id} image loading contract is invalid.`);
    } else {
      const wrapper = body.match(/<div\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/)?.[0] ?? "";
      const style = attributes(wrapper).get("style") ?? "";
      if (!style.split(";").some(declaration => declaration.trim() === `--media-aspect-ratio: ${presentation.ratio.width} / ${presentation.ratio.height}`)) errors.push(`Media ${id} video ratio does not match its dimensions.`);
      const equivalent = presentation.videoEquivalent!;
      const equivalentHtml = body.match(/<p\b[^>]*class="media-equivalent"[^>]*>([\s\S]*?)<\/p>/)?.[1];
      const equivalentText = equivalent.kind === "text" ? equivalent.text : equivalent.label;
      if (!equivalentHtml || normalizeVisibleText(decodeText(tagText(equivalentHtml))) !== normalizeVisibleText(equivalentText) ||
          (equivalent.kind === "link" && !openingTags(equivalentHtml, "a").some(tag => attributes(tag).get("href") === equivalent.href))) errors.push(`Media ${id} accessible equivalent does not match its asset.`);
      if (asset.src.startsWith("/media/")) {
        const videos = openingTags(body, "video");
        const attrs = attributes(videos[0] ?? "");
        if (videos.length !== 1 || attrs.get("src") !== asset.src || attrs.get("title") !== asset.alt) errors.push(`Media ${id} local video src/title does not match its asset.`);
        if (!localFileExists(asset.src)) errors.push(`Media ${id} local video file is missing: ${asset.src}`);
        if (asset.poster) {
          if (attrs.get("poster") !== asset.poster) errors.push(`Media ${id} local video poster does not match its asset.`);
          if (!localFileExists(asset.poster)) errors.push(`Media ${id} local video poster file is missing: ${asset.poster}`);
        }
        if (!attrs.has("controls") || !attrs.has("playsinline") || attrs.get("preload") !== "metadata") errors.push(`Media ${id} local video playback contract is invalid.`);
      } else {
        const iframes = openingTags(body, "iframe");
        const attrs = attributes(iframes[0] ?? "");
        if (iframes.length !== 1 || attrs.get("src") !== `https://www.youtube-nocookie.com/embed/${asset.src}` || attrs.get("title") !== asset.alt) errors.push(`Media ${id} video src/title does not match its asset.`);
      }
      if (!/<div\b[^>]*class="video-embed"/.test(body)) errors.push(`Media ${id} lacks its responsive video wrapper.`);
    }
  }

  if (expected) {
    const placements = {
      hero: expected.heroMedia ? [expected.heroMedia] : [],
      gallery: expected.galleryMedia,
      trailer: expected.trailerMedia ? [expected.trailerMedia] : [],
    };
    for (const [placement, expectedAssets] of Object.entries(placements)) {
      const sections = [...html.matchAll(new RegExp(`<div\\b[^>]*data-media-placement="${placement}"[^>]*>([\\s\\S]*?)</div>`, "g"))];
      const ids = [...(sections[0]?.[1] ?? "").matchAll(/data-media-id="([^"]+)"/g)].map((match) => match[1]);
      const expectedCount = expectedAssets.length > 0 ? 1 : 0;
      if (sections.length !== expectedCount || JSON.stringify(ids) !== JSON.stringify(expectedAssets.map((asset) => asset.id))) errors.push(`Media ${placement} output does not match the page mapping.`);
    }
  }
  return errors;
}


export function collectShareHtmlErrors(
  html: string,
  config: GameConfig,
  image: ImageAsset | undefined,
  localFileExists: (src: string) => boolean,
  required: boolean,
): string[] {
  const errors: string[] = [];
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? "";
  const tags = openingTags(head, "meta").map(attributes);
  const expected = resolveShareMetadata(config, image);
  if (!expected) {
    if (required) errors.push("Share image is required for final indexable output.");
    if (tags.some(tag => tag.get("property") === "og:image" || tag.get("name") === "twitter:image")) errors.push("Share metadata has no resolved manifest image.");
    return errors;
  }
  const fields = [
    ["property", "og:image", expected.url],
    ["property", "og:image:width", String(expected.width)],
    ["property", "og:image:height", String(expected.height)],
    ["property", "og:image:alt", expected.alt],
    ["name", "twitter:image", expected.url],
    ["name", "twitter:image:alt", expected.alt],
    ["name", "twitter:card", "summary_large_image"],
  ];
  for (const [attribute, field, value] of fields) {
    const matches = tags.filter(tag => tag.get(attribute) === field);
    if (matches.length !== 1 || matches[0].get("content") !== value) errors.push(`Share metadata ${field} must match its resolved manifest image exactly once.`);
  }
  if (!localFileExists(image!.src)) errors.push(`Share image local output file is missing: ${image!.src}`);
  if (head.includes(image!.rightsRef) || tags.some(tag => tag.get("name") === "rightsRef" || tag.get("property") === "rightsRef")) errors.push("Share metadata exposes private rights evidence.");
  return errors;
}
