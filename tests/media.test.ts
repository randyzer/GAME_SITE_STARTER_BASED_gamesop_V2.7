import { describe, expect, it } from "vitest";

import {
  createMediaCatalog,
  mediaCatalog,
} from "../src/data/media/catalog";
import mediaManifest from "../src/data/media/media.json";
import pageInventory from "../src/data/page-inventory.json";
import {
  imageAssetSchema,
  mediaAssetSchema,
  mediaManifestSchema,
  parseMediaManifest,
  videoAssetSchema,
} from "../src/data/schemas/media";

const image = {
  id: "caldera-map",
  type: "image" as const,
  dimensions: { width: 1200, height: 675 },
  rightsRef: "private/qa-image",
  src: "/media/maps/caldera.webp",
  alt: "The caldera basin and its three marked access paths",
  sourceUrl: "https://game.example/media/caldera",
};

const video = {
  id: "launch-trailer",
  type: "video" as const,
  dimensions: { width: 800, height: 600 },
  rightsRef: "private/qa-video",
  accessibleEquivalent: { kind: "text" as const, text: "A synthetic route crosses three checkpoints." },
  src: "AbC_123-xYz",
  alt: "Launch trailer showing the caldera expedition",
  sourceUrl: "https://game.example/media/launch",
};
const localVideo = {
  ...video,
  id: "launch-local",
  src: "/media/trailers/launch.mp4",
  poster: "/media/trailers/launch-poster.webp",
};

const manifest = {
  assets: [image, video],
  pages: [
    {
      pageId: "guide.caldera",
      hero: image.id,
      gallery: [image.id],
      trailer: video.id,
    },
  ],
};

describe("media schemas", () => {
  it("exports the fixed image, video, asset and manifest schemas", () => {
    for (const schema of [
      imageAssetSchema,
      videoAssetSchema,
      mediaAssetSchema,
      mediaManifestSchema,
    ]) {
      expect(schema.safeParse).toBeTypeOf("function");
    }
  });

  it("accepts an empty media manifest", () => {
    expect(parseMediaManifest({ assets: [], pages: [] })).toEqual({
      assets: [],
      pages: [],
    });
  });

  it("accepts each fixed page-media slot", () => {
    expect(parseMediaManifest(manifest)).toEqual(manifest);
  });

  it("accepts dotted asset IDs and references using the page ID grammar", () => {
    const input = {
      assets: [{ ...image, id: "qa.overview" }, { ...video, id: "trailer.official" }],
      pages: [{ pageId: "guide.caldera", hero: "qa.overview", gallery: ["qa.overview"], trailer: "trailer.official" }],
    };
    expect(parseMediaManifest(input)).toEqual(input);
  });

  it("allows page media without any slots", () => {
    const input = { assets: [], pages: [{ pageId: "home" }] };
    expect(parseMediaManifest(input)).toEqual(input);
  });

  it("accepts optional captions and trims descriptive text", () => {
    const input = {
      assets: [{ ...image, alt: `  ${image.alt}  `, caption: "  Western approach  " }],
      pages: [],
    };
    expect(parseMediaManifest(input).assets[0]).toEqual({
      ...image,
      caption: "Western approach",
    });
  });

  it.each(["png", "jpg", "jpeg", "webp", "avif", "gif", "svg"])(
    "accepts a safe local %s image",
    (extension) => {
      const asset = { ...image, src: `/media/maps/caldera.${extension}` };
      expect(parseMediaManifest({ assets: [asset], pages: [] }).assets).toEqual([asset]);
    },
  );

  it.each(["mp4", "webm"])("accepts a safe local %s video", (extension) => {
    const asset = {
      ...video,
      src: `/media/trailers/launch.${extension}`,
      poster: "/media/trailers/launch-poster.webp",
    };

    expect(parseMediaManifest({ assets: [asset], pages: [] }).assets).toEqual([asset]);
  });

  it.each([
    "",
    "media/caldera.webp",
    "/caldera.webp",
    "https://game.example/media/caldera.webp",
    "http://game.example/media/caldera.webp",
    "//game.example/media/caldera.webp",
    "/media/../caldera.webp",
    "/media/maps/../../caldera.webp",
    "/media/./caldera.webp",
    "/media//caldera.webp",
    "/media/maps//caldera.webp",
    "/media/maps/",
    "/media/..\\caldera.webp",
    "/media/maps\\caldera.webp",
    "/media/%2e%2e/caldera.webp",
    "/media/%252e%252e/caldera.webp",
    "/media/maps%2fcaldera.webp",
    "/media/maps%5ccaldera.webp",
    "/media/caldera.webp?size=large",
    "/media/caldera.webp#details",
    "/media/caldera\n.webp",
    "/media/caldera\u0000.webp",
    "/media/caldera\u007f.webp",
    "/media/caldera.mp4",
    "/media/caldera.html",
  ])("rejects unsafe or unsupported image src %j", (src) => {
    expect(() => parseMediaManifest({ assets: [{ ...image, src }], pages: [] })).toThrow(/src|local|image/i);
  });

  it("accepts an explicitly decorative image with empty alt", () => {
    expect(parseMediaManifest({ assets: [{ ...image, alt: "" }], pages: [] }).assets[0].alt).toBe("");
  });

  it.each(["白色守卫站在熔岩入口旁", "地图入口", "Caldera"])(
    "accepts descriptive alt without a language-specific word count: %s",
    (alt) => {
      expect(parseMediaManifest({ assets: [{ ...image, alt }], pages: [] }).assets[0].alt).toBe(alt);
    },
  );

  it.each([" ", "\n\t", "image", " Screenshot ", "photo-01", "picture", "hero", "game screenshot", "image 1", "caldera.webp", "caldera-map.png", "maps/caldera", "caldera-map"])(
    "rejects whitespace, generic, or filename-like image alt %j",
    (alt) => {
      expect(() => parseMediaManifest({ assets: [{ ...image, alt }], pages: [] })).toThrow(/alt|descriptive/i);
    },
  );

  it.each(["...", "---", "???", "TODO", "TBD", "placeholder"])(
    "rejects punctuation-only and placeholder alt %j",
    (alt) => {
      for (const asset of [image, video]) {
        expect(() =>
          parseMediaManifest({ assets: [{ ...asset, alt }], pages: [] }),
        ).toThrow(/alt|descriptive/i);
      }
    },
  );

  it.each(["", "AbC_123-xY", "AbC_123-xYzz", "AbC.123-xYz", "https://youtu.be/AbC_123-xYz", "https://www.youtube.com/watch?v=AbC_123-xYz", "//youtube.com/embed/AbC_123-xYz", "AbC_123-xYz?autoplay=1", " AbC_123-xYz "])(
    "rejects a noncanonical video ID %j",
    (src) => {
      expect(() => parseMediaManifest({ assets: [{ ...video, src }], pages: [] })).toThrow(/src|video|ID/i);
    },
  );

  it.each([
    "media/trailers/launch.mp4",
    "/media/trailers/launch.mov",
    "/media/trailers/launch.gif",
    "/media/../launch.mp4",
    "/media/trailers/../../launch.mp4",
    "/media/./launch.mp4",
    "/media//launch.mp4",
    "/media/trailers\\launch.mp4",
    "/media/trailers/%2e%2e/launch.mp4",
    "/media/trailers/launch.mp4?download=1",
    "/media/trailers/launch.mp4#preview",
  ])("rejects unsafe or unsupported local video src %j", (src) => {
    expect(() => parseMediaManifest({ assets: [{ ...video, src }], pages: [] })).toThrow(/src|video|local/i);
  });

  it.each([
    "/media/trailers/poster.mp4",
    "/media/../poster.webp",
    "/media/trailers/%2e%2e/poster.webp",
    "https://game.example/poster.webp",
  ])("rejects unsafe or unsupported video poster %j", (poster) => {
    expect(() => parseMediaManifest({ assets: [{ ...localVideo, poster }], pages: [] })).toThrow(/poster|image|local/i);
  });

  it.each(["", " ", "\n\t", "video", "trailer", "launch-trailer.mp4"])(
    "requires a meaningful nonempty video title in alt %j",
    (alt) => {
      expect(() => parseMediaManifest({ assets: [{ ...video, alt }], pages: [] })).toThrow(/alt|descriptive/i);
    },
  );

  it.each([undefined, "", "http://game.example/media", "//game.example/media", "/media/source", "https://", "https:game.example/media", "https:/game.example/media", "javascript:alert(1)"])(
    "requires an HTTPS provenance source for every asset: %j",
    (sourceUrl) => {
      for (const asset of [image, video]) {
        expect(() => parseMediaManifest({ assets: [{ ...asset, sourceUrl }], pages: [] })).toThrow(/sourceUrl|HTTPS|URL/i);
      }
    },
  );

  it("reports an invalid source URL through safeParse without throwing", () => {
    const invalidAsset = { ...image, sourceUrl: "https://" };
    expect(() => imageAssetSchema.safeParse(invalidAsset)).not.toThrow();
    expect(imageAssetSchema.safeParse(invalidAsset).success).toBe(false);
  });

  it.each(["width", "height", "crop", "variants", "placements", "title"])(
    "rejects unsupported asset field %s",
    (field) => {
      for (const asset of [image, video]) {
        expect(() => parseMediaManifest({ assets: [{ ...asset, [field]: "unsupported" }], pages: [] })).toThrow(/unrecognized|unknown/i);
      }
    },
  );

  it("keeps poster scoped to video assets only", () => {
    expect(() =>
      parseMediaManifest({
        assets: [{ ...image, poster: "/media/trailers/launch-poster.webp" }],
        pages: [],
      }),
    ).toThrow(/unrecognized|unknown/i);
  });

  it("rejects poster on YouTube video assets", () => {
    expect(() =>
      parseMediaManifest({
        assets: [{ ...video, poster: "/media/trailers/launch-poster.webp" }],
        pages: [],
      }),
    ).toThrow(/poster|local video/i);
  });

  it.each(["placements", "width", "heroMedia", "layout"])(
    "rejects unsupported page mapping field %s",
    (field) => {
      expect(() => parseMediaManifest({ assets: [], pages: [{ pageId: "home", [field]: [] }] })).toThrow(/unrecognized|unknown/i);
    },
  );

  it("rejects unsupported top-level manifest fields", () => {
    expect(() => parseMediaManifest({ assets: [], pages: [], variants: [] })).toThrow(/unrecognized|unknown/i);
  });

  it.each(["", "Caldera-map", "caldera_map", "caldera..map", "caldera--map"])(
    "requires the established lowercase asset ID grammar: %j",
    (id) => {
      expect(() => parseMediaManifest({ assets: [{ ...image, id }], pages: [] })).toThrow(/id/i);
    },
  );

  it.each(["", "Guide.caldera", "guide_caldera", "guide..caldera"])(
    "requires the established lowercase page ID grammar: %j",
    (pageId) => {
      expect(() => parseMediaManifest({ assets: [], pages: [{ pageId }] })).toThrow(/pageId/i);
    },
  );

  it("rejects duplicate asset IDs even when the assets are unused", () => {
    expect(() => parseMediaManifest({ assets: [image, { ...image, src: "/media/other.webp" }], pages: [] })).toThrow(/duplicate.*id/i);
  });

  it("rejects duplicate page mappings", () => {
    expect(() => parseMediaManifest({ assets: [], pages: [{ pageId: "home" }, { pageId: "home" }] })).toThrow(/duplicate.*page/i);
  });

  it.each(["hero", "gallery", "trailer"])(
    "rejects a missing asset reference in the %s slot",
    (slot) => {
      const value = slot === "gallery" ? ["missing-asset"] : "missing-asset";
      expect(() => parseMediaManifest({ assets: [], pages: [{ pageId: "home", [slot]: value }] })).toThrow(/unknown|missing|exist/i);
    },
  );

  it.each(["hero", "gallery", "trailer"])(
    "rejects the wrong media type in the %s slot",
    (slot) => {
      const value = slot === "gallery" ? [video.id] : slot === "hero" ? video.id : image.id;
      expect(() => parseMediaManifest({ assets: [image, video], pages: [{ pageId: "home", [slot]: value }] })).toThrow(/image|video/i);
    },
  );

  it("validates unused assets instead of silently dropping them", () => {
    expect(() => parseMediaManifest({ assets: [{ ...image, src: "https://game.example/image.webp" }], pages: [] })).toThrow(/src|local|image/i);
  });
});

describe("media catalog", () => {
  it("loads the current project manifest without discarding valid assets", () => {
    expect(mediaCatalog.assets).toEqual(mediaManifest.assets);
  });

  it("returns no slots for an unmapped page", () => {
    expect(createMediaCatalog({ assets: [], pages: [] }, ["home"]).getPageMedia("home")).toEqual({ galleryMedia: [] });
  });

  it("resolves all page-media slots using asset IDs", () => {
    const catalog = createMediaCatalog(manifest, ["guide.caldera"]);
    expect(catalog.assets).toEqual([image, video]);
    expect(catalog.getAsset(image.id)).toEqual(image);
    expect(catalog.getAsset(video.id)).toEqual(video);
    expect(catalog.getPageMedia("guide.caldera")).toEqual({
      heroMedia: image,
      galleryMedia: [image],
      trailerMedia: video,
    });
  });

  it("returns an empty gallery when it is omitted", () => {
    const catalog = createMediaCatalog({ assets: [image], pages: [{ pageId: "home", hero: image.id }] }, ["home"]);
    expect(catalog.getPageMedia("home")).toEqual({ heroMedia: image, galleryMedia: [] });
  });

  it("preserves authored gallery order", () => {
    const second = { ...image, id: "caldera-west", src: "/media/caldera-west.webp", alt: "The western route into the caldera" };
    const catalog = createMediaCatalog({ assets: [image, second], pages: [{ pageId: "home", gallery: [second.id, image.id] }] }, ["home"]);
    expect(catalog.getPageMedia("home").galleryMedia).toEqual([second, image]);
  });

  it("throws when an explicit asset lookup is unknown", () => {
    const catalog = createMediaCatalog({ assets: [], pages: [] }, ["home"]);
    expect(() => catalog.getAsset("missing-asset")).toThrow(/unknown.*asset|asset.*exist/i);
  });

  it("rejects mappings to page IDs absent from the complete inventory", () => {
    expect(() => createMediaCatalog(manifest, ["home"])).toThrow(/page.*guide.caldera|guide.caldera.*page/i);
  });

  it("allows future authoring for disabled or unpublished inventory pages", () => {
    const completeInventory = [
      ...pageInventory,
      { pageId: "guide.draft", publicationStatus: "draft" },
      { pageId: "hero.future", feature: "heroes" },
    ];
    const input = { assets: [image], pages: [{ pageId: "guide.draft", hero: image.id }, { pageId: "hero.future", hero: image.id }] };
    const catalog = createMediaCatalog(input, completeInventory.map((entry) => entry.pageId));
    expect(catalog.getPageMedia("guide.draft").heroMedia).toEqual(image);
    expect(catalog.getPageMedia("hero.future").heroMedia).toEqual(image);
  });

  it("validates broken media references on unpublished mappings", () => {
    expect(() => createMediaCatalog({ assets: [], pages: [{ pageId: "guide.draft", hero: "missing-asset" }] }, ["guide.draft"])).toThrow(/unknown|missing|exist/i);
  });

  it("checks every local image, including assets unused by pages", () => {
    const checked: string[] = [];
    const catalog = createMediaCatalog({ assets: [image, video], pages: [] }, [], (src) => {
      checked.push(src);
      return true;
    });
    expect(checked).toEqual([image.src]);
    expect(catalog.assets).toEqual([image, video]);
  });

  it("checks local videos and posters through the injected file checker", () => {
    const checked: string[] = [];
    const catalog = createMediaCatalog({ assets: [localVideo], pages: [] }, [], (src) => {
      checked.push(src);
      return true;
    });

    expect(checked).toEqual([localVideo.src, localVideo.poster]);
    expect(catalog.assets).toEqual([localVideo]);
  });

  it("rejects missing local video and poster files", () => {
    expect(() =>
      createMediaCatalog({ assets: [localVideo], pages: [] }, [], (src) => src !== localVideo.src),
    ).toThrow(/video.*exist/i);
    expect(() =>
      createMediaCatalog({ assets: [localVideo], pages: [] }, [], (src) => src !== localVideo.poster),
    ).toThrow(/poster.*exist/i);
  });

  it("rejects a local image rejected by the injected file checker", () => {
    expect(() => createMediaCatalog({ assets: [image], pages: [] }, [], () => false)).toThrow(/file|image.*exist/i);
  });

  it("propagates a file-checking error without accepting the asset", () => {
    expect(() => createMediaCatalog({ assets: [image], pages: [] }, [], () => {
      throw new Error("Unable to inspect local image");
    })).toThrow("Unable to inspect local image");
  });

  it("accepts valid local paths without requiring a filesystem callback", () => {
    expect(createMediaCatalog({ assets: [image], pages: [] }, []).assets).toEqual([image]);
  });
});

const contractImage = { ...image, dimensions: { width: 1200, height: 675 }, rightsRef: "qa-rights/image", credit: { text: "QA author", url: "https://example.com/author" } };
const contractVideo = { ...video, dimensions: { width: 800, height: 600 }, rightsRef: "qa-rights/video", accessibleEquivalent: { kind: "text" as const, text: "A synthetic route crosses three checkpoints." } };
describe("WS03B explicit media contract", () => {
  it("accepts explicit dimensions, evidence pointer and public attribution", () => {
    expect(imageAssetSchema.parse(contractImage)).toEqual(contractImage);
    expect(videoAssetSchema.parse(contractVideo)).toEqual(contractVideo);
  });
  it("rejects populated legacy records without silently supplying metadata", () => {
    const legacy = { id: image.id, type: image.type, src: image.src, alt: image.alt, sourceUrl: image.sourceUrl };
    const result = imageAssetSchema.safeParse(legacy);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(i => i.path[0])).toEqual(expect.arrayContaining(["dimensions", "rightsRef"]));
  });
  it.each([0, -1, 1.5])("rejects invalid dimension %s", width => {
    expect(imageAssetSchema.safeParse({ ...contractImage, dimensions: { width, height: 600 } }).success).toBe(false);
  });
  it.each([{ width: 800 }, { height: 600 }, { width: 800, height: 600, ratio: "4/3" }])("rejects partial or extra dimension fields %j", dimensions => {
    expect(imageAssetSchema.safeParse({ ...contractImage, dimensions }).success).toBe(false);
  });
  it.each(["", "   "])("rejects empty rights pointer %j", rightsRef => {
    expect(imageAssetSchema.safeParse({ ...contractImage, rightsRef }).success).toBe(false);
  });
  it.each([{ text: "" }, { text: "Author", url: "http://example.com" }, { text: "Author", status: "VERIFIED" }])("rejects invalid public credit %j", credit => {
    expect(imageAssetSchema.safeParse({ ...contractImage, credit }).success).toBe(false);
  });
  it("requires equivalent information independently of the video title", () => {
    const { accessibleEquivalent, ...without } = contractVideo;
    expect(videoAssetSchema.safeParse(without).success).toBe(false);
    expect(videoAssetSchema.parse({ ...contractVideo, accessibleEquivalent: { kind: "link", label: "Transcript", href: "/guides/getting-started/" } }).accessibleEquivalent).toEqual({ kind: "link", label: "Transcript", href: "/guides/getting-started/" });
  });
  it.each([{ kind: "text", text: "" }, { kind: "text", text: "Route", href: "/extra/" }, { kind: "link", label: "", href: "/guide/" }, { kind: "link", label: "Transcript", href: "javascript:alert(1)" }, { kind: "link", label: "Transcript", href: "//example.com" }, { kind: "link", label: "Transcript", href: "/%2e%2e/private" }])("rejects unsafe equivalent %j", accessibleEquivalent => {
    expect(videoAssetSchema.safeParse({ ...contractVideo, accessibleEquivalent }).success).toBe(false);
  });
  it("keeps empty manifests and unmapped pages valid", () => {
    expect(parseMediaManifest({ assets: [], pages: [] })).toEqual({ assets: [], pages: [] });
    expect(createMediaCatalog({ assets: [], pages: [] }, ["home"]).getPageMedia("home")).toEqual({ galleryMedia: [] });
  });
  it("resolves public presentation identically through adapter and catalog, without rights metadata", async () => {
    const adapters = import.meta.glob<{ resolveMediaPresentation: (asset: unknown) => unknown }>("../src/core/media-presentation.ts");
    const load = adapters["../src/core/media-presentation.ts"];
    expect(load, "pure media presentation adapter exists").toBeTypeOf("function");
    const { resolveMediaPresentation } = await load();
    for (const asset of [contractImage, contractVideo, { ...contractVideo, src: "/media/trailer.mp4" }]) {
      const parsed = mediaAssetSchema.parse(asset);
      const publicData = resolveMediaPresentation(parsed);
      expect(publicData).toMatchObject({ id: asset.id, type: asset.type, dimensions: asset.dimensions, ratio: asset.dimensions, source: { url: asset.sourceUrl } });
      expect(JSON.stringify(publicData)).not.toContain(asset.rightsRef);
      expect(JSON.stringify(publicData)).not.toContain("rightsRef");
      const catalog = createMediaCatalog({ assets: [asset], pages: [] }, []);
      expect((catalog as unknown as { getPresentation: (id: string) => unknown }).getPresentation(asset.id)).toEqual(publicData);
    }
  });
});


describe("WS03C share references in the media authority", () => {
  const explicit = { ...image, id: "share.explicit" };
  const fallback = { ...image, id: "share.default" };
  it("accepts share references without adding visual placement data", () => {
    const input = { assets: [image, explicit, fallback], defaultShare: fallback.id, pages: [{ pageId: "home", hero: image.id, share: explicit.id }] };
    expect(parseMediaManifest(input)).toEqual(input);
    const catalog = createMediaCatalog(input, ["home", "guide.caldera"]);
    expect(catalog.getPageMedia("home")).toEqual({ heroMedia: image, galleryMedia: [] });
  });
  it("resolves explicit share before informative hero before default", () => {
    const catalog = createMediaCatalog({ assets: [image, explicit, fallback], defaultShare: fallback.id, pages: [{ pageId: "home", hero: image.id, share: explicit.id }, { pageId: "guide.caldera", hero: image.id }] }, ["home", "guide.caldera", "about"]);
    const resolve = (catalog as unknown as { getShareMedia: (pageId: string) => unknown }).getShareMedia;
    expect(resolve).toBeTypeOf("function");
    expect(resolve("home")).toEqual(explicit);
    expect(resolve("guide.caldera")).toEqual(image);
    expect(resolve("about")).toEqual(fallback);
  });
  it("skips decorative hero and does not infer share media from galleries", () => {
    const decorative = { ...image, alt: "" };
    const catalog = createMediaCatalog({ assets: [decorative, fallback], defaultShare: fallback.id, pages: [{ pageId: "home", hero: decorative.id, gallery: [fallback.id] }] }, ["home"]);
    const resolve = (catalog as unknown as { getShareMedia: (pageId: string) => unknown }).getShareMedia;
    expect(resolve).toBeTypeOf("function");expect(resolve("home")).toEqual(fallback);
    const noDefault = createMediaCatalog({ assets: [decorative, fallback], pages: [{ pageId: "home", hero: decorative.id, gallery: [fallback.id] }] }, ["home"]);
    expect((noDefault as unknown as { getShareMedia: (pageId: string) => unknown }).getShareMedia("home")).toBeUndefined();
  });
  it("returns undefined when no share image exists without inventing a placeholder", () => {
    const catalog = createMediaCatalog({ assets: [], pages: [] }, ["home"]);
    const resolve = (catalog as unknown as { getShareMedia: (pageId: string) => unknown }).getShareMedia;
    expect(resolve).toBeTypeOf("function");expect(resolve("home")).toBeUndefined();
  });
  it.each(["missing.asset", video.id, "decorative"])("rejects invalid explicit and default share image %s", id => {
    const assets = [image, video, { ...image, id: "decorative", alt: "" }];
    expect(mediaManifestSchema.safeParse({ assets, pages: [{ pageId: "home", share: id }] }).success).toBe(false);
    expect(mediaManifestSchema.safeParse({ assets, pages: [], defaultShare: id }).success).toBe(false);
  });
  it("does not let a share-only mapping create an inventory page", () => {
    expect(() => createMediaCatalog({ assets: [image], pages: [{ pageId: "unknown", share: image.id }] }, ["home"])).toThrow(/inventory/);
  });
});
