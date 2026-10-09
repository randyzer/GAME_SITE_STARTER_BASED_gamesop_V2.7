import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { imageAssetSchema, videoAssetSchema } from "../src/data/schemas/media";

const modules = import.meta.glob("../scripts/media-validation.ts");
const temporaryDirectories: string[] = [];
const image = { id: "qa.overview", type: "image" as const, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-image", src: "/media/overview.svg", alt: "A route crosses three mountain checkpoints", sourceUrl: "https://example.com/overview" };
const video = { id: "qa.trailer", type: "video" as const, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-video", accessibleEquivalent: { kind: "text" as const, text: "A synthetic route crosses three checkpoints." }, src: "aqz-KE-bpKQ", alt: "A titled test trailer", sourceUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" };
const localVideo = { ...video, id: "qa.local", src: "/media/trailer.mp4", poster: "/media/poster.webp", sourceUrl: "https://example.com/trailer" };
const imageHtml = `<figure class="game-media" data-media-id="${image.id}"><img src="${image.src}" alt="${image.alt}" loading="lazy" decoding="async" width="800" height="600"><figcaption><a href="${image.sourceUrl}">Image source</a></figcaption></figure>`;
const videoHtml = `<figure class="game-media game-media--video" data-media-id="${video.id}"><div class="video-embed" style="--media-aspect-ratio: 800 / 600"><iframe src="https://www.youtube-nocookie.com/embed/${video.src}" title="${video.alt}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="media-equivalent">${video.accessibleEquivalent.text}</p><figcaption><a href="${video.sourceUrl}">Video source</a></figcaption></figure>`;
const localVideoHtml = `<figure class="game-media game-media--video" data-media-id="${localVideo.id}"><div class="video-embed" style="--media-aspect-ratio: 800 / 600"><video src="${localVideo.src}" poster="${localVideo.poster}" title="${localVideo.alt}" controls playsinline preload="metadata"></video></div><p class="media-equivalent">${video.accessibleEquivalent.text}</p><figcaption><a href="${localVideo.sourceUrl}">Video source</a></figcaption></figure>`;

async function validation() {
  const load = modules["../scripts/media-validation.ts"];
  expect(load, "media validation helpers exist").toBeTypeOf("function");
  return await load() as typeof import("../scripts/media-validation");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("media filesystem validation", () => {
  it("requires a regular local file contained in public/media, including after symlink resolution", async () => {
    const { isLocalImageFile, isLocalMediaFile } = await validation();
    const root = mkdtempSync(join(tmpdir(), "starter-media-test-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "media"));
    writeFileSync(join(root, "media", "image.svg"), "<svg/>");
    writeFileSync(join(root, "outside.svg"), "<svg/>");
    symlinkSync(join(root, "outside.svg"), join(root, "media", "escape.svg"));
    expect(isLocalImageFile("/media/image.svg", root)).toBe(true);
    writeFileSync(join(root, "media", "trailer.mp4"), "video");
    expect(isLocalMediaFile("/media/trailer.mp4", root)).toBe(true);
    for (const src of ["/media/missing.svg", "/media/", "/media/../outside.svg", "/media/escape.svg", "https://example.com/image.svg", "/outside.svg"]) {
      expect(isLocalImageFile(src, root), src).toBe(false);
      expect(isLocalMediaFile(src, root), src).toBe(false);
    }
  });

  it("emits non-blocking advisories for unusually large local video assets", async () => {
    const { collectLocalVideoAdvisories } = await validation();

    expect(collectLocalVideoAdvisories([localVideo], () => 1_000_000)).toEqual([]);
    expect(collectLocalVideoAdvisories([localVideo], () => 30_000_000).join(" ")).toMatch(/advisory|local video|heuristic/i);
  });
});

describe("generated media audit", () => {
  it("accepts empty output and correctly rendered local image/video markup", async () => {
    const { collectMediaHtmlErrors } = await validation();
    expect(collectMediaHtmlErrors("<main>Text only</main>", [], () => false)).toEqual([]);
    expect(collectMediaHtmlErrors(imageHtml + videoHtml, [image, video], () => true)).toEqual([]);
    expect(collectMediaHtmlErrors(localVideoHtml, [localVideo], () => true)).toEqual([]);
  });

  it("rejects missing output files, remote images and wrong alt", async () => {
    const { collectMediaHtmlErrors } = await validation();
    expect(collectMediaHtmlErrors(imageHtml, [image], () => false).join(" ")).toMatch(/missing|local/i);
    expect(collectMediaHtmlErrors(imageHtml.replace(image.src, "https://example.com/remote.jpg"), [image], () => true).join(" ")).toMatch(/image.*src|local/i);
    expect(collectMediaHtmlErrors(imageHtml.replace(image.alt, "wrong alt"), [image], () => true).join(" ")).toMatch(/alt/i);
  });

  it("does not classify configured site chrome images as content media", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const headerLogo = `<header><a class="brand" href="/" aria-label="Game Atlas home"><img class="brand__logo" src="/logo.svg" alt="" aria-hidden="true"></a></header>`;

    expect(collectMediaHtmlErrors(headerLogo, [], () => false)).toEqual([]);
  });

  it("still rejects invalid article content media image output", async () => {
    const { collectMediaHtmlErrors } = await validation();

    expect(
      collectMediaHtmlErrors(
        imageHtml.replace(image.src, "/media/missing.svg"),
        [image],
        () => false,
      ).join(" "),
    ).toMatch(/image|src|missing|local/i);
  });

  it("detects configured chrome logo paths without treating them as content media", async () => {
    const { collectChromeHtmlErrors, isPublicImageFile } = await validation();
    const html = `<a class="brand" href="/" aria-label="Game Atlas home"><img class="brand__logo" src="/logo.svg" alt=""></a>`;

    expect(
      collectChromeHtmlErrors(html, { logoPath: "/logo.svg" }, (src) => src === "/logo.svg"),
    ).toEqual([]);
    expect(
      collectChromeHtmlErrors(html, { logoPath: "/missing-logo.svg" }, () => false).join(" "),
    ).toMatch(/logo|missing/i);
    expect(
      collectChromeHtmlErrors(`<header><img class="brand__logo" src="/logo.svg" alt=""></header>`, { logoPath: "/logo.svg" }, () => true).join(" "),
    ).toMatch(/home link/i);
    expect(isPublicImageFile("https://example.com/logo.svg", "/tmp")).toBe(false);
  });

  it.each([
    ['title="A titled test trailer"', 'title=""'],
    ['loading="lazy"', 'loading="eager"'],
    ['www.youtube-nocookie.com', 'www.youtube.com'],
    ['allowfullscreen', ''],
    ['allow="encrypted-media; picture-in-picture; fullscreen"', 'allow="autoplay; camera"'],
    ['class="video-embed"', 'class="unframed"'],
  ])("rejects a broken iframe contract: %s", async (before, after) => {
    const { collectMediaHtmlErrors } = await validation();
    expect(collectMediaHtmlErrors(videoHtml.replace(before, after), [video], () => true).length).toBeGreaterThan(0);
  });

  it.each([
    ['controls', ''],
    ['playsinline', ''],
    ['preload="metadata"', 'preload="auto"'],
    [`src="${localVideo.src}"`, 'src="/media/wrong.mp4"'],
    [`poster="${localVideo.poster}"`, 'poster="/media/wrong.webp"'],
    ['class="video-embed"', 'class="unframed"'],
  ])("rejects a broken native video contract: %s", async (before, after) => {
    const { collectMediaHtmlErrors } = await validation();
    expect(collectMediaHtmlErrors(localVideoHtml.replace(before, after), [localVideo], () => true).length).toBeGreaterThan(0);
  });

  it("rejects raw unsupported iframes and unknown asset IDs", async () => {
    const { collectMediaHtmlErrors } = await validation();
    expect(collectMediaHtmlErrors('<iframe src="https://example.com/embed"></iframe>', [], () => true).length).toBeGreaterThan(0);
    expect(collectMediaHtmlErrors(imageHtml, [], () => true).join(" ")).toMatch(/unknown|unregistered/i);
  });

  it("reconciles the three fixed page placements and disallows empty wrappers", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const expected = { heroMedia: image, galleryMedia: [image], trailerMedia: video };
    const html = `<div data-media-placement="hero">${imageHtml}</div><div data-media-placement="gallery"><div class="screenshot-gallery">${imageHtml}</div></div><div data-media-placement="trailer">${videoHtml}</div>`;
    expect(collectMediaHtmlErrors(html, [image, video], () => true, expected)).toEqual([]);
    expect(collectMediaHtmlErrors("", [image, video], () => true, expected).join(" ")).toMatch(/hero|gallery|trailer/);
    expect(collectMediaHtmlErrors('<div data-media-placement="gallery"></div>', [], () => true, { galleryMedia: [] }).length).toBeGreaterThan(0);
  });

  it("rejects duplicate rendered placements even when both match the mapped asset", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const hero = `<div data-media-placement="hero">${imageHtml}</div>`;
    expect(collectMediaHtmlErrors(hero + hero, [image], () => true, { heroMedia: image, galleryMedia: [] }).join(" ")).toMatch(/hero/);
  });
});


describe("WS03B visible-text whitespace semantics", () => {
  it("accepts valid internal whitespace in public credit", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const asset = imageAssetSchema.parse({ ...image, credit: { text: "Synthetic QA\n  author" } });
    const html = imageHtml.replace("<figcaption>", '<figcaption><span class="media-credit">Synthetic QA author</span>');
    expect(collectMediaHtmlErrors(html, [asset], () => true)).toEqual([]);
  });
  it("accepts valid internal whitespace in equivalent text", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const asset = videoAssetSchema.parse({ ...video, accessibleEquivalent: { kind: "text", text: "Technical QA\n  equivalent" } });
    const html = videoHtml.replace(video.accessibleEquivalent.text, "Technical QA equivalent");
    expect(collectMediaHtmlErrors(html, [asset], () => true)).toEqual([]);
  });
  it("accepts valid internal whitespace in equivalent link labels", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const asset = videoAssetSchema.parse({ ...video, accessibleEquivalent: { kind: "link", label: "Technical QA\n  equivalent", href: "/about/" } });
    const html = videoHtml.replace(video.accessibleEquivalent.text, '<a href="/about/">Technical QA equivalent</a>');
    expect(collectMediaHtmlErrors(html, [asset], () => true)).toEqual([]);
  });
  it("still rejects different credit, equivalent text and link label", async () => {
    const { collectMediaHtmlErrors } = await validation();
    const credit = imageAssetSchema.parse({ ...image, credit: { text: "Synthetic QA author" } });
    expect(collectMediaHtmlErrors(imageHtml.replace("<figcaption>", '<figcaption><span class="media-credit">Different author</span>'), [credit], () => true).join(" ")).toMatch(/credit/);
    expect(collectMediaHtmlErrors(videoHtml.replace(video.accessibleEquivalent.text, "A substantively different description."), [video], () => true).join(" ")).toMatch(/equivalent/);
    const link = videoAssetSchema.parse({ ...video, accessibleEquivalent: { kind: "link", label: "Technical QA equivalent", href: "/about/" } });
    expect(collectMediaHtmlErrors(videoHtml.replace(video.accessibleEquivalent.text, '<a href="/about/">A different label</a>'), [link], () => true).join(" ")).toMatch(/equivalent/);
  });
});


describe("WS03C generated share metadata audit", () => {
  const config = { site: { url: "https://field-notes.example" } };
  const share = { ...image, alt: "A synthetic route share illustration" };
  const url = new URL(share.src, config.site.url).href;
  const html = `<head><meta property="og:image" content="${url}"><meta property="og:image:width" content="800"><meta property="og:image:height" content="600"><meta property="og:image:alt" content="${share.alt}"><meta name="twitter:image" content="${url}"><meta name="twitter:image:alt" content="${share.alt}"><meta name="twitter:card" content="summary_large_image"></head>`;
  async function audit() {
    const module = await validation();
    const collect = Reflect.get(module, "collectShareHtmlErrors") as (html: string, config: unknown, share: unknown, exists: (path: string) => boolean, required: boolean) => string[];
    expect(collect).toBeTypeOf("function");return collect;
  }
  it("requires share metadata on final indexable output but permits no-image optional output", async () => {
    const collect = await audit();
    expect(collect(html, config, share, () => true, true)).toEqual([]);
    expect(collect("<head></head>", config, undefined, () => true, true).join(" ")).toMatch(/share|required/i);
    expect(collect("<head></head>", config, undefined, () => true, false)).toEqual([]);
  });
  it.each([
    [url, "https://wrong.example/other.svg"],
    ['content="800"', 'content="1"'],
    ['content="600"', 'content="1"'],
    [share.alt, "A different illustration"],
    ['content="summary_large_image"', 'content="summary"'],
  ])("rejects conflicting share metadata: %s", async (before, after) => {
    expect((await audit())(html.replace(before, after), config, share, () => true, true).length).toBeGreaterThan(0);
  });
  it("rejects missing local output, duplicate metadata and private evidence leaks", async () => {
    const collect = await audit();
    expect(collect(html, config, share, () => false, true).join(" ")).toMatch(/missing|local/);
    expect(collect(html.replace("</head>", `<meta property="og:image" content="${url}"></head>`), config, share, () => true, true).length).toBeGreaterThan(0);
    expect(collect(html.replace("</head>", `<meta name="rightsRef" content="${share.rightsRef}"></head>`), config, share, () => true, true).join(" ")).toMatch(/private|rights/i);
  });
});
