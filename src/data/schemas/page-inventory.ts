import { z } from "zod";

import { featureFlagKeys } from "../../config/schema";
import { entityModuleKeys, entityTypeKeys } from "../entity-modules";
import {
  confidenceSchema,
  isoDateSchema,
  provenanceSchema,
} from "./provenance";

export const pageTypeSchema = z.enum([
  "home",
  "guide",
  ...entityTypeKeys,
  "search",
  "calculator",
  "planner",
  "hub",
  "database",
  "meta",
  "patch",
  "about",
  "privacy",
  "terms",
  "not-found",
]);

export const pageModuleSchema = z.enum([
  "core",
  "guides",
  ...entityModuleKeys,
  "tierLists",
  "news",
  "search",
  "tools",
]);

export const entityTypeSchema = z.enum(entityTypeKeys);

export const entityReferenceSchema = z
  .object({
    entityType: entityTypeSchema,
    entityId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export const legalActivationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable") }).strict(),
  z.object({
    state: z.literal("active"),
    approvedContentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
]);

export const pageInventoryEntrySchema = z
  .object({
    pageId: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
    route: z
      .string()
      .regex(
        /^(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*|\/404\.html)$/,
        "Route must start and end with a slash and use lowercase URL segments.",
      ),
    pageType: pageTypeSchema,
    cluster: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    module: pageModuleSchema,
    feature: z.enum(featureFlagKeys).optional(),
    priority: z.number().int().min(0).max(100),
    visibility: z.enum(["public", "unlisted", "private"]),
    publicationStatus: z.enum([
      "draft",
      "scheduled",
      "published",
      "archived",
    ]),
    contentStatus: z.enum([
      "planned",
      "outline",
      "draft",
      "review",
      "ready",
      "stale",
    ]),
    developmentStatus: z.enum(["planned", "building", "ready", "blocked"]),
    needsReview: z.boolean(),
    needsUpdate: z.boolean(),
    legalActivation: legalActivationSchema.optional(),
    indexability: z.enum(["index", "noindex"]),
    title: z.string().trim().min(20).max(65),
    description: z.string().trim().min(50).max(170),
    publishedAt: isoDateSchema.optional(),
    updatedAt: isoDateSchema,
    primaryKeyword: z.string().trim().min(2).max(80),
    tags: z.array(z.string().trim().min(2).max(40)).min(1),
    contentRef: z
      .object({
        collection: z.enum(["guides", "news", "tierLists"]),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      })
      .strict()
      .optional(),
    entityRef: entityReferenceSchema.optional(),
    relatedPageIds: z.array(z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)),
    relatedEntityRefs: z.array(entityReferenceSchema),
    sources: z.array(provenanceSchema).min(1),
    confidence: confidenceSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.legalActivation && !["privacy", "terms"].includes(entry.pageType)) {
      context.addIssue({
        code: "custom",
        message: `Non-legal page "${entry.pageId}" cannot declare legalActivation.`,
        path: ["legalActivation"],
      });
    }
    if (
      entry.visibility === "public" &&
      entry.publicationStatus === "published" &&
      !entry.publishedAt
    ) {
      context.addIssue({
        code: "custom",
        message: `Live page "${entry.pageId}" requires publishedAt.`,
        path: ["publishedAt"],
      });
    }
  });

export const pageInventorySchema = z
  .array(pageInventoryEntrySchema)
  .superRefine((entries, context) => {
    const pageIds = new Map<string, number>();
    const routes = new Map<string, number>();
    const primaryKeywords = new Map<string, number>();
    const legalPageTypes = new Set<string>();

    entries.forEach((entry, index) => {
      if (entry.pageType === "privacy" || entry.pageType === "terms") {
        if (legalPageTypes.has(entry.pageType)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate legal page type: ${entry.pageType}`,
            path: [index, "pageType"],
          });
        }
        legalPageTypes.add(entry.pageType);
      }
      const normalizedPrimaryKeyword = entry.primaryKeyword
        .trim()
        .toLocaleLowerCase("en");
      if (pageIds.has(entry.pageId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate pageId: ${entry.pageId}`,
          path: [index, "pageId"],
        });
      }
      if (routes.has(entry.route)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate route: ${entry.route}`,
          path: [index, "route"],
        });
      }
      if (primaryKeywords.has(normalizedPrimaryKeyword)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate primary keyword: ${entry.primaryKeyword}`,
          path: [index, "primaryKeyword"],
        });
      }

      pageIds.set(entry.pageId, index);
      routes.set(entry.route, index);
      primaryKeywords.set(normalizedPrimaryKeyword, index);
    });
  });

export type PageType = z.output<typeof pageTypeSchema>;
export type PageModule = z.output<typeof pageModuleSchema>;
export type EntityType = z.output<typeof entityTypeSchema>;
export type EntityReference = z.output<typeof entityReferenceSchema>;
export type PageInventoryEntry = z.output<typeof pageInventoryEntrySchema>;

export function parsePageInventory(input: unknown): PageInventoryEntry[] {
  return pageInventorySchema.parse(input);
}
