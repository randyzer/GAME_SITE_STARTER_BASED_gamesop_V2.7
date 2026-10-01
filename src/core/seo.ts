import { createHash } from "node:crypto";

import type { GameConfig } from "../config/schema";
import type { PageInventoryEntry } from "../data/schemas/page-inventory";

export type StructuredDataNode = Record<string, unknown> & {
  "@type": string;
  "@id"?: string;
};

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface ResolvedStructuredIdentity {
  nodes: StructuredDataNode[];
  sitePublisher?: { "@id": string };
  articleAuthor?: { "@id": string };
  articlePublisher?: { "@id": string };
  authorAttribution?: { id: string; name: string };
}

type IdentityKind = "Organization" | "Person";
type IdentityInput = {
  kind: IdentityKind;
  name: string;
  projectConfirmed: true;
  evidenceRef: string;
};

export function buildCanonicalUrl(config: GameConfig, route: string): string {
  return new URL(route, config.site.url).href;
}

export function getSitemapRoutes(pages: PageInventoryEntry[]): string[] {
  return pages
    .filter((page) => page.indexability === "index")
    .map((page) => page.route);
}

export function buildBreadcrumbTrail(
  config: GameConfig,
  page: PageInventoryEntry,
  catalog: PageInventoryEntry[],
): BreadcrumbItem[] {
  const ancestors = catalog
    .filter(
      (candidate) =>
        candidate.route !== page.route &&
        candidate.route !== "/404.html" &&
        page.route.startsWith(candidate.route),
    )
    .sort((left, right) => left.route.length - right.route.length);

  return [...ancestors, page].map((candidate) => ({
    name:
      candidate.pageType === "home" ? config.brand.name : candidate.title,
    url: buildCanonicalUrl(config, candidate.route),
  }));
}

function isArticleConsumer(page: PageInventoryEntry): boolean {
  return page.pageType === "guide" || page.pageType === "meta" || page.pageType === "patch";
}

function identityFingerprint(identity: IdentityInput): string {
  return JSON.stringify([
    identity.kind,
    identity.name.trim(),
    identity.evidenceRef.trim(),
  ]);
}

function identityNodeId(config: GameConfig, identity: IdentityInput): string {
  const digest = createHash("sha256")
    .update(identityFingerprint(identity), "utf8")
    .digest("hex");
  return `${buildCanonicalUrl(config, "/")}#identity-${digest}`;
}

export function resolveStructuredIdentity(
  config: GameConfig,
  page: PageInventoryEntry,
): ResolvedStructuredIdentity {
  const nodesByFingerprint = new Map<string, StructuredDataNode>();
  const identityConfig = config.identity;

  const register = (identity: IdentityInput) => {
    const fingerprint = identityFingerprint(identity);
    const existing = nodesByFingerprint.get(fingerprint);
    if (existing) {
      return { "@id": existing["@id"] as string, name: existing.name as string };
    }

    const id = identityNodeId(config, identity);
    const duplicateId = [...nodesByFingerprint.values()].find((node) => node["@id"] === id);
    if (duplicateId) {
      throw new Error(`Structured identity resolver produced a conflicting controlled ID for page "${page.pageId}".`);
    }

    const node: StructuredDataNode = {
      "@type": identity.kind,
      "@id": id,
      name: identity.name.trim(),
    };
    nodesByFingerprint.set(fingerprint, node);
    return { "@id": id, name: identity.name.trim() };
  };

  if (identityConfig?.organization) {
    register(identityConfig.organization);
  }

  let sitePublisher: { "@id": string } | undefined;
  if (identityConfig?.sitePublisher) {
    const resolved = register(identityConfig.sitePublisher.identity);
    sitePublisher = { "@id": resolved["@id"] };
  }

  let articleAuthor: { "@id": string } | undefined;
  let articlePublisher: { "@id": string } | undefined;
  let authorAttribution: { id: string; name: string } | undefined;
  const articleRoles = isArticleConsumer(page)
    ? identityConfig?.articles?.[page.pageId]
    : undefined;

  if (articleRoles?.author) {
    const resolved = register(articleRoles.author.identity);
    articleAuthor = { "@id": resolved["@id"] };
    authorAttribution = { id: resolved["@id"], name: resolved.name };
  }
  if (articleRoles?.publisher) {
    const resolved = register(articleRoles.publisher.identity);
    articlePublisher = { "@id": resolved["@id"] };
  }

  return {
    nodes: [...nodesByFingerprint.values()],
    sitePublisher,
    articleAuthor,
    articlePublisher,
    authorAttribution,
  };
}

export function buildBaseSeoGraph(
  config: GameConfig,
  page: PageInventoryEntry,
): StructuredDataNode[] {
  const siteUrl = buildCanonicalUrl(config, "/");
  const canonical = buildCanonicalUrl(config, page.route);
  const identity = resolveStructuredIdentity(config, page);

  const website: StructuredDataNode = {
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    url: siteUrl,
    name: config.brand.name,
    description: config.seo.defaultDescription,
    inLanguage: config.site.locale,
  };
  if (identity.sitePublisher) website.publisher = identity.sitePublisher;

  return [
    ...identity.nodes,
    website,
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: page.title,
      description: page.description,
      datePublished: page.publishedAt,
      dateModified: page.updatedAt,
      inLanguage: config.site.locale,
      isPartOf: { "@id": `${siteUrl}#website` },
    },
  ];
}

export function buildBreadcrumbSchema(
  canonical: string,
  trail: BreadcrumbItem[],
): StructuredDataNode {
  return {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildArticleSchema(
  config: GameConfig,
  page: PageInventoryEntry,
): StructuredDataNode {
  const canonical = buildCanonicalUrl(config, page.route);
  const identity = resolveStructuredIdentity(config, page);
  const article: StructuredDataNode = {
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: page.title,
    description: page.description,
    datePublished: page.publishedAt,
    dateModified: page.updatedAt,
    inLanguage: config.site.locale,
    mainEntityOfPage: { "@id": `${canonical}#webpage` },
  };
  if (identity.articleAuthor) article.author = identity.articleAuthor;
  if (identity.articlePublisher) article.publisher = identity.articlePublisher;
  return article;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectJsonObjects(value: unknown, output: Record<string, unknown>[]): void {
  const record = recordValue(value);
  if (record) {
    output.push(record);
    for (const nested of Object.values(record)) collectJsonObjects(nested, output);
    return;
  }
  if (Array.isArray(value)) {
    for (const nested of value) collectJsonObjects(nested, output);
  }
}

function normalizeControlledType(value: unknown): IdentityKind[] {
  const values = Array.isArray(value) ? value : [value];
  const result: IdentityKind[] = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    if (item === "Organization" || item === "https://schema.org/Organization" || item === "http://schema.org/Organization") {
      result.push("Organization");
    }
    if (item === "Person" || item === "https://schema.org/Person" || item === "http://schema.org/Person") {
      result.push("Person");
    }
  }
  return result;
}

function roleReferenceId(value: unknown): string | null {
  const record = recordValue(value);
  if (!record) return null;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "@id" || typeof record["@id"] !== "string") {
    return null;
  }
  return record["@id"];
}

export function collectStructuredIdentityErrors(
  config: GameConfig,
  page: PageInventoryEntry,
  values: unknown[],
): string[] {
  const errors: string[] = [];
  const resolved = resolveStructuredIdentity(config, page);
  const expectedNodes = new Map(
    resolved.nodes.map((node) => [node["@id"] as string, node]),
  );
  const seenNodeCounts = new Map<string, number>();
  const siteUrl = buildCanonicalUrl(config, "/");
  const canonical = buildCanonicalUrl(config, page.route);
  const websiteId = `${siteUrl}#website`;
  const articleId = `${canonical}#article`;
  const legacyOrganizationId = `${siteUrl}#organization`;
  const objects: Record<string, unknown>[] = [];
  for (const value of values) collectJsonObjects(value, objects);

  let sawSitePublisher = false;
  let sawArticleAuthor = false;
  let sawArticlePublisher = false;

  for (const object of objects) {
    const controlledTypes = normalizeControlledType(object["@type"]);
    const objectId = typeof object["@id"] === "string" ? object["@id"] : undefined;
    const isControlledIdentityNode = controlledTypes.length > 0;

    if (isControlledIdentityNode) {
      const rawTypes = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
      if (controlledTypes.length !== 1 || rawTypes.length !== 1) {
        errors.push(`[${page.pageId}] Controlled identity nodes must declare exactly one controlled type.`);
      }
      if (!objectId || !expectedNodes.has(objectId)) {
        errors.push(`[${page.pageId}] JSON-LD contains an unconfigured controlled identity node.`);
      } else {
        seenNodeCounts.set(objectId, (seenNodeCounts.get(objectId) ?? 0) + 1);
        const expected = expectedNodes.get(objectId)!;
        const expectedType = expected["@type"] as IdentityKind;
        if (controlledTypes[0] !== expectedType || object.name !== expected.name) {
          errors.push(`[${page.pageId}] Controlled identity node does not match configured type/name.`);
        }
        const keys = Object.keys(object).sort();
        if (keys.join("|") !== "@id|@type|name") {
          errors.push(`[${page.pageId}] Controlled identity node contains unsupported public fields.`);
        }
      }
    }

    for (const property of ["author", "publisher"] as const) {
      if (!(property in object)) continue;
      const ownerId = objectId;
      const expectedId =
        property === "publisher" && ownerId === websiteId
          ? resolved.sitePublisher?.["@id"]
          : property === "author" && ownerId === articleId
            ? resolved.articleAuthor?.["@id"]
            : property === "publisher" && ownerId === articleId
              ? resolved.articlePublisher?.["@id"]
              : undefined;
      const actualId = roleReferenceId(object[property]);
      if (!expectedId || !actualId || actualId !== expectedId) {
        errors.push(`[${page.pageId}] JSON-LD contains an unsupported ${property} identity role.`);
      } else if (ownerId === websiteId && property === "publisher") {
        sawSitePublisher = true;
      } else if (ownerId === articleId && property === "author") {
        sawArticleAuthor = true;
      } else if (ownerId === articleId && property === "publisher") {
        sawArticlePublisher = true;
      }
    }

    if (objectId && !isControlledIdentityNode) {
      const isControlledReference = objectId.startsWith(`${siteUrl}#identity-`) || objectId === legacyOrganizationId;
      if (isControlledReference) {
        if (!expectedNodes.has(objectId)) {
          errors.push(`[${page.pageId}] JSON-LD contains a dangling or legacy controlled identity reference.`);
        }
        const keys = Object.keys(object);
        if (keys.length !== 1 || keys[0] !== "@id") {
          errors.push(`[${page.pageId}] Controlled identity references must contain only @id.`);
        }
      }
    }
  }

  for (const id of expectedNodes.keys()) {
    const count = seenNodeCounts.get(id) ?? 0;
    if (count !== 1) {
      errors.push(`[${page.pageId}] Expected controlled identity node must appear exactly once.`);
    }
  }
  if (resolved.sitePublisher && !sawSitePublisher) {
    errors.push(`[${page.pageId}] Configured site publisher role is missing from JSON-LD.`);
  }
  if (resolved.articleAuthor && !sawArticleAuthor) {
    errors.push(`[${page.pageId}] Configured article author role is missing from JSON-LD.`);
  }
  if (resolved.articlePublisher && !sawArticlePublisher) {
    errors.push(`[${page.pageId}] Configured article publisher role is missing from JSON-LD.`);
  }

  return [...new Set(errors)];
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function buildRobotsTxt(config: GameConfig): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${new URL("/sitemap-index.xml", config.site.url).href}`,
    "",
  ].join("\n");
}
