import { z } from "zod";

const mediaIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const imageExtensions = /\.(?:png|jpe?g|webp|avif|gif|svg)$/i;
const videoExtensions = /\.(?:mp4|webm)$/i;
const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

function isSafeMediaPath(src: string, extensions: RegExp): boolean {
  if (!src.startsWith("/media/") || !extensions.test(src)) return false;

  return src
    .slice("/media/".length)
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        /^[a-z0-9._-]+$/i.test(segment),
    );
}

export function isLocalImagePath(src: string): boolean {
  return isSafeMediaPath(src, imageExtensions);
}

export function isLocalVideoPath(src: string): boolean {
  return isSafeMediaPath(src, videoExtensions);
}

export function isYouTubeVideoId(src: string): boolean {
  return youtubeIdPattern.test(src);
}

function isDescriptiveText(text: string): boolean {
  const genericLabel =
    /^(?:(?:a|an|the|game|official)\s+)?(?:image|photo|picture|screenshot|thumbnail|hero|banner|media|graphic|video|trailer|asset)(?:[\s_-]*\d+)?[.!]?$/i;
  const filename =
    /^[^\s]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov)$/i;
  const filenameStem = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/;
  const path = /^[^\s]*[\\/][^\s]*$/;
  const placeholder = /^(?:todo|tbd|placeholder)$/i;

  return (
    /[\p{L}\p{N}]/u.test(text) &&
    !genericLabel.test(text) &&
    !filename.test(text) &&
    !filenameStem.test(text) &&
    !path.test(text) &&
    !placeholder.test(text)
  );
}

const descriptiveTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    isDescriptiveText,
    "Use descriptive alt text, not a generic label or filename.",
  );

const httpsUrlSchema = z.url().refine(
  (value) => /^https:\/\//i.test(value) && URL.canParse(value) && new URL(value).protocol === "https:",
  { message: "Media URL must use HTTPS." },
);
const dimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();
const creditSchema = z.object({
  text: z.string().trim().min(1),
  url: httpsUrlSchema.optional(),
}).strict();

function isSafeEquivalentPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") &&
    !/[\\%?#\s]/.test(value) &&
    value.slice(1).split("/").every(segment => segment !== "." && segment !== ".." && /^[a-z0-9._-]*$/i.test(segment));
}
const accessibleEquivalentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1) }).strict(),
  z.object({
    kind: z.literal("link"),
    label: z.string().trim().min(1),
    href: z.union([httpsUrlSchema, z.string().refine(isSafeEquivalentPath, "Use a safe root-relative path or HTTPS URL.")]),
  }).strict(),
]);

const commonAssetShape = {
  id: mediaIdSchema,
  caption: z.string().trim().min(1).optional(),
  sourceUrl: httpsUrlSchema,
  dimensions: dimensionsSchema,
  // An evidence pointer is required; it never implies rights approval.
  rightsRef: z.string().trim().min(1),
  credit: creditSchema.optional(),
};

export const imageAssetSchema = z
  .object({
    ...commonAssetShape,
    type: z.literal("image"),
    src: z.string().refine(
      isLocalImagePath,
      "Image src must be a safe local image path under /media/.",
    ),
    alt: z.union([z.literal(""), descriptiveTextSchema]),
  })
  .strict();

export const videoAssetSchema = z
  .object({
    ...commonAssetShape,
    type: z.literal("video"),
    src: z.string().refine(
      (src) => isYouTubeVideoId(src) || isLocalVideoPath(src),
      "Video src must be a canonical 11-character YouTube ID or safe local MP4/WebM path under /media/.",
    ),
    poster: z.string().refine(
      isLocalImagePath,
      "Video poster must be a safe local image path under /media/.",
    ).optional(),
    alt: descriptiveTextSchema,
    accessibleEquivalent: accessibleEquivalentSchema,
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.poster && !isLocalVideoPath(asset.src)) {
      context.addIssue({
        code: "custom",
        message: "Video poster is only valid for local MP4/WebM video assets.",
        path: ["poster"],
      });
    }
  });

export const mediaAssetSchema = z.discriminatedUnion("type", [
  imageAssetSchema,
  videoAssetSchema,
]);

const pageMediaSchema = z
  .object({
    pageId: mediaIdSchema,
    hero: mediaIdSchema.optional(),
    gallery: z.array(mediaIdSchema).optional(),
    trailer: mediaIdSchema.optional(),
    share: mediaIdSchema.optional(),
  })
  .strict();

export const mediaManifestSchema = z
  .object({
    assets: z.array(mediaAssetSchema),
    pages: z.array(pageMediaSchema),
    defaultShare: mediaIdSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const assets = new Map<string, MediaAsset>();
    const pageIds = new Set<string>();

    manifest.assets.forEach((asset, index) => {
      if (assets.has(asset.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate media asset ID: ${asset.id}`,
          path: ["assets", index, "id"],
        });
      }
      assets.set(asset.id, asset);
    });

    function checkShareReference(id: string, path: (string | number)[]) {
      const asset = assets.get(id);
      if (!asset || asset.type !== "image" || asset.alt === "") {
        context.addIssue({
          code: "custom",
          message: `Share image must reference an existing informative image asset: ${id}`,
          path,
        });
      }
    }
    if (manifest.defaultShare) checkShareReference(manifest.defaultShare, ["defaultShare"]);

    manifest.pages.forEach((page, index) => {
      if (pageIds.has(page.pageId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate media page mapping: ${page.pageId}`,
          path: ["pages", index, "pageId"],
        });
      }
      pageIds.add(page.pageId);

      function checkReference(
        id: string,
        type: MediaAsset["type"],
        path: (string | number)[],
      ) {
        const asset = assets.get(id);
        if (!asset) {
          context.addIssue({
            code: "custom",
            message: `Unknown media asset ID: ${id}`,
            path: ["pages", index, ...path],
          });
        } else if (asset.type !== type) {
          context.addIssue({
            code: "custom",
            message: `Media slot requires ${type} media: ${id}`,
            path: ["pages", index, ...path],
          });
        }
      }

      if (page.hero) checkReference(page.hero, "image", ["hero"]);
      page.gallery?.forEach((id, galleryIndex) =>
        checkReference(id, "image", ["gallery", galleryIndex]),
      );
      if (page.trailer) checkReference(page.trailer, "video", ["trailer"]);
      if (page.share) checkShareReference(page.share, ["pages", index, "share"]);
    });
  });

export type ImageAsset = z.output<typeof imageAssetSchema>;
export type VideoAsset = z.output<typeof videoAssetSchema>;
export type MediaAsset = z.output<typeof mediaAssetSchema>;
export type PageMedia = z.output<typeof pageMediaSchema>;
export type MediaManifest = z.output<typeof mediaManifestSchema>;

export function parseMediaManifest(input: unknown): MediaManifest {
  return mediaManifestSchema.parse(input);
}
