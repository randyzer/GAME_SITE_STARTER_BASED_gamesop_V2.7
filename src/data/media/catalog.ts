import { resolveMediaPresentation } from "../../core/media-presentation";
import pageInventory from "../page-inventory.json";
import {
  isLocalVideoPath,
  parseMediaManifest,
  type ImageAsset,
  type MediaAsset,
  type VideoAsset,
} from "../schemas/media";
import mediaManifest from "./media.json";

export type ResolvedPageMedia = {
  heroMedia?: ImageAsset;
  galleryMedia: ImageAsset[];
  trailerMedia?: VideoAsset;
};

export function createMediaCatalog(
  input: unknown,
  pageIds: readonly string[],
  localFileExists?: (src: string) => boolean,
) {
  const manifest = parseMediaManifest(input);
  const knownPageIds = new Set(pageIds);
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const pages = new Map<string, ResolvedPageMedia>();

  if (localFileExists) {
    for (const asset of manifest.assets) {
      if (asset.type === "image" && !localFileExists(asset.src)) {
        throw new Error(`Local image file does not exist: ${asset.src}`);
      }
      if (asset.type === "video" && isLocalVideoPath(asset.src) && !localFileExists(asset.src)) {
        throw new Error(`Local video file does not exist: ${asset.src}`);
      }
      if (asset.type === "video" && asset.poster && !localFileExists(asset.poster)) {
        throw new Error(`Local video poster file does not exist: ${asset.poster}`);
      }
    }
  }

  function getAsset(id: string): MediaAsset {
    const asset = assets.get(id);
    if (!asset) throw new Error(`Unknown media asset ID: ${id}`);
    return asset;
  }

  function getImage(id: string): ImageAsset {
    const asset = getAsset(id);
    if (asset.type !== "image") throw new Error(`Expected image asset: ${id}`);
    return asset;
  }

  function getVideo(id: string): VideoAsset {
    const asset = getAsset(id);
    if (asset.type !== "video") throw new Error(`Expected video asset: ${id}`);
    return asset;
  }

  for (const page of manifest.pages) {
    if (!knownPageIds.has(page.pageId)) {
      throw new Error(`Unknown inventory page for media mapping: ${page.pageId}`);
    }

    pages.set(page.pageId, {
      ...(page.hero ? { heroMedia: getImage(page.hero) } : {}),
      galleryMedia: page.gallery?.map(getImage) ?? [],
      ...(page.trailer ? { trailerMedia: getVideo(page.trailer) } : {}),
    });
  }

  return {
    assets: manifest.assets,
    getAsset,
    getPresentation(id: string) {
      return resolveMediaPresentation(getAsset(id));
    },
    getShareMedia(pageId: string): ImageAsset | undefined {
      if (!knownPageIds.has(pageId)) return undefined;
      const mapping = manifest.pages.find((page) => page.pageId === pageId);
      if (mapping?.share) return getImage(mapping.share);
      const hero = pages.get(pageId)?.heroMedia;
      if (hero?.alt) return hero;
      return manifest.defaultShare ? getImage(manifest.defaultShare) : undefined;
    },
    getPageMedia(pageId: string): ResolvedPageMedia {
      return pages.get(pageId) ?? { galleryMedia: [] };
    },
  };
}

export const mediaCatalog = createMediaCatalog(
  mediaManifest,
  pageInventory.map((page) => page.pageId),
);
