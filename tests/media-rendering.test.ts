import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import WikiArticle from "../src/components/wiki/WikiArticle.astro";
import EntityDetail from "../src/components/EntityDetail.astro";
import GuidesRoute from "../src/pages/guides/[...slug].astro";
import { parsePageInventory } from "../src/data/schemas/page-inventory";
import { collectMediaHtmlErrors } from "../scripts/media-validation";

type AstroComponent = Parameters<AstroContainer["renderToString"]>[0];
const components = import.meta.glob<{ default: AstroComponent }>("../src/components/media/*.astro");
const image = {
  id: "qa.overview",
  type: "image" as const,
  dimensions: { width: 1200, height: 675 },
  rightsRef: "private/qa-image",
  src: "/media/qa-overview.svg",
  alt: "Synthetic terrain overview with a route across three checkpoints",
  caption: "Synthetic QA fixture — not a screenshot from a real game.",
  sourceUrl: "https://example.com/media-qa/overview",
};
const video = {
  id: "qa.trailer",
  type: "video" as const,
  dimensions: { width: 800, height: 600 },
  rightsRef: "private/qa-video",
  accessibleEquivalent: { kind: "text" as const, text: "A synthetic route crosses three checkpoints." },
  src: "aqz-KE-bpKQ",
  alt: "Big Buck Bunny test trailer",
  caption: "Public test video used only to inspect the embed layout.",
  sourceUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
};
const localVideo = {
  ...video,
  id: "qa.local-trailer",
  src: "/media/qa-trailer.mp4",
  poster: "/media/qa-poster.webp",
};
// Shell rendering cases own their pages independently of adopted game content.
const base = {
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  publishedAt: "2026-08-10", updatedAt: "2026-09-20", tags: ["testing"],
  relatedPageIds: [], relatedEntityRefs: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-media-shell", sourceType: "editorial", accessedAt: "2026-09-21",
    evidenceNote: "Synthetic editorial source for media shell rendering tests, not game media approval." }],
};
const [page, hubPage] = parsePageInventory([
  { ...base, pageId: "guide.qa-media-shell", route: "/guides/qa-media-shell/", pageType: "guide",
    title: "Synthetic Media Shell Test Guide", primaryKeyword: "synthetic media shell guide",
    description: "Synthetic guide input for optional media placements, source rendering and body headings.",
    contentRef: { collection: "guides", slug: "qa-media-shell" } },
  { ...base, pageId: "hub.qa-media-shell", route: "/guides/", pageType: "hub",
    title: "Synthetic Media Shell Guide Hub", primaryKeyword: "synthetic media shell hub",
    description: "Synthetic hub input for hero-only media treatment and guide article navigation." },
]);

async function renderMedia(name: string, props: Record<string, unknown>) {
  const load = components[`../src/components/media/${name}.astro`];
  expect(load, `${name} component exists`).toBeTypeOf("function");
  const { default: component } = await load();
  const container = await AstroContainer.create();
  return container.renderToString(component, { props });
}

describe("rendered media primitives", () => {
  it("defines intrinsic image flow, responsive gallery and authored-ratio iframe sizing", () => {
    const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.game-media img\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/);
    expect(css).toMatch(/\.video-embed\s*\{[^}]*aspect-ratio:\s*var\(--media-aspect-ratio\);/);
    expect(css).toMatch(/\.video-embed iframe\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/);
    expect(css).toMatch(/\.screenshot-gallery\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,/);
  });
  it("renders a local image with explicit alt, provenance and caption", async () => {
    const html = await renderMedia("GameMedia", { asset: image });
    expect(html).toContain(`src="${image.src}"`);
    expect(html).toContain(`alt="${image.alt}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain(image.caption);
    expect(html).toContain(`href="${image.sourceUrl}"`);
    expect(html).toContain('class="game-media');
  });

  it("loads a hero eagerly with intrinsic dimensions and without srcset variants", async () => {
    const html = await renderMedia("GameMedia", { asset: image, eager: true });
    expect(html).toContain('loading="eager"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="675"');
    expect(html).not.toMatch(/\bsrcset="/);
  });

  it("renders decorative images with an explicit empty alt", async () => {
    const html = await renderMedia("GameMedia", { asset: { ...image, alt: "" } });
    expect(html).toMatch(/\balt(?:=""|(?=\s|>))/);
  });

  it("escapes caption text rather than accepting HTML", async () => {
    const html = await renderMedia("GameMedia", { asset: { ...image, caption: '<script>alert("x")</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a lazy titled YouTube-nocookie iframe with constrained permissions", async () => {
    const html = await renderMedia("VideoEmbed", { asset: video });
    expect(html).toContain(`src="https://www.youtube-nocookie.com/embed/${video.src}"`);
    expect(html).toContain(`title="${video.alt}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('allow="encrypted-media; picture-in-picture; fullscreen"');
    expect(html).toContain("allowfullscreen");
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('class="video-embed"');
    expect(html).toContain(`href="${video.sourceUrl}"`);
    expect(html).not.toMatch(/<script|autoplay|srcdoc/);
  });

  it("renders a local video with native metadata-only playback controls", async () => {
    const html = await renderMedia("VideoEmbed", { asset: localVideo });

    expect(html).toContain(`<video`);
    expect(html).toContain(`src="${localVideo.src}"`);
    expect(html).toContain(`poster="${localVideo.poster}"`);
    expect(html).toContain("controls");
    expect(html).toContain("playsinline");
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('class="video-embed"');
    expect(html).toContain(`href="${localVideo.sourceUrl}"`);
    expect(html).not.toMatch(/<iframe\b|youtube-nocookie|autoplay/);
  });

  it("dispatches video assets through GameMedia", async () => {
    expect(await renderMedia("GameMedia", { asset: video })).toContain("youtube-nocookie.com/embed/");
    expect(await renderMedia("GameMedia", { asset: localVideo })).toContain(`<video`);
  });

  it.each([image, video])("audits real $type output with punctuation in accessible text", async (asset) => {
    const describedAsset = { ...asset, alt: 'Damage > Armor & the "Scout" comparison', sourceUrl: "https://example.com/source?compare=damage>armor&view=details" };
    const html = await renderMedia("GameMedia", { asset: describedAsset });
    expect(collectMediaHtmlErrors(html, [describedAsset], () => true)).toEqual([]);
  });

  it("renders no markup for an empty gallery", async () => {
    expect((await renderMedia("ScreenshotGallery", { assets: [] })).trim()).toBe("");
  });

  it("renders gallery images in input order", async () => {
    const html = await renderMedia("ScreenshotGallery", { assets: [image, { ...image, id: "qa.detail", src: "/media/qa-detail.svg" }] });
    expect(html.match(/<img\b/g)).toHaveLength(2);
    expect(html.indexOf("qa-overview.svg")).toBeLessThan(html.indexOf("qa-detail.svg"));
    expect(html).toContain('class="screenshot-gallery"');
  });
});

describe("optional media in existing page shells", () => {
  it("keeps no-media WikiArticle complete and without empty media wrappers", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(WikiArticle, { props: { page }, slots: { default: "<p>Body content remains available.</p>" } });
    expect(html).toContain(page.title);
    expect(html).toContain("Body content remains available.");
    expect(html).toMatch(/Sources &(?:amp;)? verification/);
    expect(html).not.toMatch(/<iframe\b|class="(?:game-media|screenshot-gallery)|data-media-placement/);
  });

  it("adds fixed placements without mixing media captions into the TOC", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(WikiArticle, {
      props: { page, heroMedia: image, galleryMedia: [image], trailerMedia: video, headings: [
        { depth: 2, slug: "start", text: "Start here" },
        { depth: 3, slug: "details", text: "Details" },
      ] },
      slots: { default: '<h2 id="start">Start here</h2><h3 id="details">Details</h3>' },
    });
    expect(html.match(/<img\b[^>]*src="\/media\//g)).toHaveLength(2);
    expect(html.match(/<iframe\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const toc = html.match(/<nav aria-labelledby="wiki-toc-title">([\s\S]*?)<\/nav>/)?.[1];
    expect(toc).toContain('href="#start"');
    expect(toc).toContain('href="#details"');
    expect(toc).not.toMatch(/Sources|trailer|fixture|Related|Quick facts/);
  });

  it("keeps EntityDetail facts intact with and without media", async () => {
    const props = { page, entityLabel: "Test entity", fields: [{ label: "Role", value: "Scout" }], fact: { id: "qa-entity", name: "Test entity", summary: "Synthetic entity used only for rendering tests.", patch: "1.0", updatedAt: "2026-09-03", confidence: "high", sources: page.sources } };
    const container = await AstroContainer.create();
    const plain = await container.renderToString(EntityDetail, { props });
    const rich = await container.renderToString(EntityDetail, { props: { ...props, heroMedia: image, galleryMedia: [image], trailerMedia: video } });
    expect(plain).toContain("Scout");
    expect(plain).not.toMatch(/<iframe\b|data-media-placement|class="game-media/);
    expect(rich).toContain("Scout");
    expect(rich.match(/<img\b[^>]*src="\/media\//g)).toHaveLength(2);
    expect(rich.match(/<iframe\b/g)).toHaveLength(1);
  });

  it("renders guide hub hero media only and omits empty hub media wrappers", async () => {
    const container = await AstroContainer.create();
    const baseRecord = {
      view: "hub" as const,
      path: undefined,
      page: hubPage,
      guidePages: [page],
    };
    const plain = await container.renderToString(GuidesRoute, {
      props: { record: baseRecord },
    });
    const rich = await container.renderToString(GuidesRoute, {
      props: {
        record: {
          ...baseRecord,
          pageMedia: {
            heroMedia: image,
            galleryMedia: [image],
            trailerMedia: video,
          },
        },
      },
    });

    expect(plain).toContain(hubPage.title);
    expect(plain).not.toMatch(/data-media-placement|<iframe\b|class="game-media/);
    expect(rich).toContain('data-media-placement="hero"');
    expect(rich).toContain(`src="${image.src}"`);
    expect(rich).not.toContain('data-media-placement="gallery"');
    expect(rich).not.toContain('data-media-placement="trailer"');
    expect(rich).not.toMatch(/<iframe\b/);
  });

  it("allows entity/database hubs to receive only a hero media anchor", async () => {
    const source = readFileSync(
      new URL("../src/components/EntityDatabase.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain("heroMedia");
    expect(source).toContain('data-media-placement="hero"');
    expect(source).toContain("<GameMedia");
    expect(source).not.toContain("galleryMedia");
    expect(source).not.toContain("trailerMedia");
    expect(source).not.toContain('data-media-placement="gallery"');
    expect(source).not.toContain('data-media-placement="trailer"');
  });

  it("provides a constrained static wiki renderer with fixed media placements only", async () => {
    const components = import.meta.glob<{ default: AstroComponent }>("../src/components/*.astro");
    const load = components["../src/components/StaticWikiPage.astro"];
    expect(load, "StaticWikiPage component exists").toBeTypeOf("function");
    if (!load) return;
    const { default: StaticWikiPage } = await load();
    const container = await AstroContainer.create();
    const plain = await container.renderToString(StaticWikiPage, {
      props: { page },
      slots: { default: "<p>Static body content.</p>" },
    });
    const rich = await container.renderToString(StaticWikiPage, {
      props: {
        page,
        heroMedia: image,
        galleryMedia: [image],
        trailerMedia: video,
      },
      slots: { default: "<p>Static body content.</p>" },
    });

    expect(plain).toContain("Static body content.");
    expect(plain).not.toMatch(/data-media-placement|class="game-media|<iframe\b/);
    expect(rich.match(/data-media-placement="/g)).toHaveLength(3);
    expect(rich).not.toMatch(/mediaSlot|placementName|routeOwnership|pageBuilder/i);
  });
});

describe("WS03B public media rendering", () => {
  it("reserves intrinsic image dimensions and exposes credit without evidence pointers", async () => {
    const asset = { ...image, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-image", credit: { text: "QA illustrator", url: "https://example.com/credit" } };
    const html = await renderMedia("GameMedia", { asset });
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
    expect(html).toContain("QA illustrator");
    expect(html).toContain('href="https://example.com/credit"');
    expect(html).not.toContain(asset.rightsRef);
    expect(html).not.toContain("rightsRef");
    expect(collectMediaHtmlErrors(html.replace('width="800"', 'width="1"'), [asset], () => true).join(" ")).toMatch(/dimension/i);
  });
  it.each([video, localVideo])("derives video ratio and always exposes equivalent information: $id", async base => {
    const asset = { ...base, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-video", accessibleEquivalent: { kind: "text" as const, text: "A rabbit explores a synthetic landscape." } };
    const html = await renderMedia("VideoEmbed", { asset });
    expect(html).toContain("--media-aspect-ratio: 800 / 600");
    expect(html).toContain(asset.accessibleEquivalent.text);
    expect(html).toContain(`href="${asset.sourceUrl}"`);
    expect(html).not.toContain(asset.rightsRef);
    expect(collectMediaHtmlErrors(html.replace(asset.accessibleEquivalent.text, ""), [asset], () => true).join(" ")).toMatch(/equivalent/i);
  });
  it("escapes equivalent and credit text and renders a safe transcript link", async () => {
    const asset = { ...video, dimensions: { width: 800, height: 600 }, rightsRef: "private/qa-video", credit: { text: "<b>Author</b>" }, accessibleEquivalent: { kind: "link" as const, label: "<b>Transcript</b>", href: "/guides/getting-started/" } };
    const html = await renderMedia("VideoEmbed", { asset });
    expect(html).toContain("&lt;b&gt;Transcript&lt;/b&gt;");
    expect(html).toContain("&lt;b&gt;Author&lt;/b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain('href="/guides/getting-started/"');
  });
});
