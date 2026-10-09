import type { MediaAsset } from "../data/schemas/media";

/** Public presentation of a validated asset. Evidence and workflow fields stay private. */
export function resolveMediaPresentation(asset: MediaAsset) {
  return {
    id: asset.id,
    type: asset.type,
    dimensions: { width: asset.dimensions.width, height: asset.dimensions.height },
    ratio: { width: asset.dimensions.width, height: asset.dimensions.height },
    publicCredit: asset.credit
      ? { text: asset.credit.text, ...(asset.credit.url ? { url: asset.credit.url } : {}) }
      : null,
    source: { url: asset.sourceUrl, label: asset.type === "image" ? "Image source" : "Video source" },
    videoEquivalent: asset.type === "video"
      ? asset.accessibleEquivalent.kind === "text"
        ? { kind: "text" as const, text: asset.accessibleEquivalent.text }
        : { kind: "link" as const, label: asset.accessibleEquivalent.label, href: asset.accessibleEquivalent.href }
      : null,
  };
}
