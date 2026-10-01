import type { GameConfig } from "../src/config/schema";
import { attributesFromTag, decodeHtml } from "../src/core/html-audit";
import type { ContentEntryReference } from "../src/core/page-resolution";
import { getStaticPageCopy } from "../src/core/static-page-copy";
import { projectPublicSources } from "../src/core/public-sources";
import type { PageInventoryEntry } from "../src/data/schemas/page-inventory";

export type ResidueScope = "branding" | "url" | "public-text";
export interface ResidueSurface { id: string; scope: ResidueScope; text: string }
export interface ResidueSignals { errors: string[]; warnings: string[]; checked: string[] }
interface CoreSentinel {
  id: string;
  literal: string;
  surface: ResidueScope;
  ordinary?: boolean;
  exact?: boolean;
}

// Fixed shipped signatures remain detectable after projects replace their source copy.
export const CORE_SENTINELS = Object.freeze([
  { id: "core.domain", literal: "gameatlas.example", surface: "url", ordinary: true },
  { id: "core.brand", literal: "Game Atlas", surface: "branding", ordinary: true },
  { id: "core.short-name", literal: "Atlas", surface: "branding", ordinary: true, exact: true },
  { id: "core.social", literal: "@gameatlas", surface: "branding", ordinary: true },
  { id: "core.setup-title", literal: "How to Configure This Game Site Starter", surface: "public-text" },
  { id: "core.setup-intro", literal: "This starter keeps publishing decisions separate from prose. Configure those decisions first, then write against a stable page contract.", surface: "public-text" },
  { id: "core.setup-brand", literal: "Edit `game.config.ts`. Replace the starter name, canonical HTTPS URL, default SEO copy, and social handle. Keep the locale on an English tag such as `en`, `en-US`, or `en-GB` for the global English-market build.", surface: "public-text" },
  { id: "core.setup-brand-rendered", literal: "Edit game.config.ts. Replace the starter name, canonical HTTPS URL, default SEO copy, and social handle. Keep the locale on an English tag such as en, en-US, or en-GB for the global English-market build.", surface: "public-text" },
  { id: "core.about-intro", literal: "Game Atlas is a reusable editorial system for answering game questions with less noise and clearer evidence.", surface: "public-text" },
  { id: "core.legal-notice", literal: "This is starter text, not legal advice. Replace it after qualified legal review for your business, jurisdiction, hosting, analytics, advertising, and data practices.", surface: "public-text" },
  { id: "core.privacy-intro", literal: "This starter is static by default and does not include accounts, contact forms, behavioral analytics, advertising pixels, or a customer database.", surface: "public-text" },
  { id: "core.privacy-handling", literal: "The shipped interface does not ask visitors to submit personal information. If you add forms, analytics, advertising, embedded media, or account features, document those systems here before launch.", surface: "public-text" },
  { id: "core.privacy-hosting", literal: "Your hosting and security providers may process IP addresses, request headers, and diagnostic logs to deliver and protect the site. Identify your actual providers, retention periods, and legal basis.", surface: "public-text" },
  { id: "core.privacy-links", literal: "Evidence links lead to third-party sites with their own policies. Visiting those services is governed by the destination provider, not this starter.", surface: "public-text" },
  { id: "core.terms-intro", literal: "These starter terms describe an informational game guide site. They must be adapted to the operator, content rights, monetization, audience, and governing law.", surface: "public-text" },
  { id: "core.terms-use", literal: "Guides, rankings, and tools are provided for general informational purposes. Game balance, availability, and platform behavior can change after publication.", surface: "public-text" },
  { id: "core.terms-rights", literal: "Game names and marks belong to their respective owners. Replace this paragraph with the attribution, license, fair-use position, and takedown process appropriate to the real project.", surface: "public-text" },
  { id: "core.terms-changes", literal: "The operator may correct, update, or remove content as facts change. Add the warranty, liability, dispute, and governing-law provisions required for the production business.", surface: "public-text" },
  { id: "core.media-readme", literal: "This is a syntax example, not a supplied asset or approved source. Replace the file, description, and source URL with reviewed project material.", surface: "public-text" },
  { id: "core.logo-name", literal: "Game Atlas logo", surface: "branding", ordinary: true },
] satisfies CoreSentinel[]);

const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();

function hasExampleDomain(text: string): boolean {
  let found = false;
  // URL parsing distinguishes encoded hosts from paths, credentials and suffix lookalikes.
  const remaining = text.replace(/https?:\/\/[^\s<>"'`]+|(?<![:\w])\/\/[^\s<>"'`]+/gi, (token) => {
    try {
      const candidate = token.replace(/[),.;]+$/, "");
      const hostname = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate)
        .hostname.toLowerCase().replace(/\.$/, "");
      if (hostname === "gameatlas.example" || hostname.endsWith(".gameatlas.example")) found = true;
      return " ";
    } catch { return token; }
  });
  return found || /(?<![a-z0-9_.-])(?:[a-z0-9-]+\.)*gameatlas\.example(?![a-z0-9_.-])/i.test(remaining);
}

export function scanResidueSurfaces(
  surfaces: ResidueSurface[],
  expectedIds: string[],
  purpose: "final" | "evidence" = "final",
  additions: NonNullable<GameConfig["residueSentinels"]> = [],
): ResidueSignals {
  const signals: ResidueSignals = { errors: [], warnings: [], checked: [] };
  if (CORE_SENTINELS.length === 0 || new Set(CORE_SENTINELS.map((entry) => entry.id)).size !== CORE_SENTINELS.length) {
    signals.errors.push("PP-02 Core sentinel catalog is missing or invalid.");
  }
  if (expectedIds.length === 0 || new Set(expectedIds).size !== expectedIds.length || new Set(surfaces.map((surface) => surface.id)).size !== surfaces.length ||
    JSON.stringify([...expectedIds].sort()) !== JSON.stringify(surfaces.map((surface) => surface.id).sort())) {
    signals.errors.push("PP-02 required surface coverage is incomplete, duplicated or unregistered.");
  }
  for (const surface of surfaces) {
    if (typeof surface.text !== "string") {
      signals.errors.push(`PP-02 unreadable required surface: ${surface.id}.`);
      continue;
    }
    const text = normalized(surface.text);
    for (const entry of [...CORE_SENTINELS, ...additions]) {
      if (entry.surface !== surface.scope) continue;
      const literal = normalized(entry.literal);
      const match = entry.id === "core.domain" ? hasExampleDomain(text)
        : "exact" in entry && entry.exact ? text.toLowerCase() === literal.toLowerCase()
        : entry.surface === "branding" ? text.toLowerCase().includes(literal.toLowerCase()) : text.includes(literal);
      if (!match) continue;
      const message = `PP-02 ${entry.id} residue on ${surface.id}.`;
      if (purpose === "evidence" && "ordinary" in entry && entry.ordinary) signals.warnings.push(message);
      else signals.errors.push(message);
    }
    signals.checked.push(surface.id);
  }
  return signals;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function projectHtmlResidueSurfaces(id: string, html: string): ResidueSurface[] {
  const surfaces: ResidueSurface[] = [];
  const add = (suffix: string, scope: ResidueScope, text: string) => surfaces.push({ id: `${id}:${suffix}`, scope, text });
  const text = (source: string) => decodeHtml(source
    .replace(/<\/?(?:address|article|aside|blockquote|br|caption|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, ""));
  const readable = html.replace(/<!--[^]*?-->/g, " ").replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, " ");
  add("text", "public-text", text(readable));
  add("text-urls", "url", text(readable));
  for (const [index, match] of [...html.matchAll(/<(title|header|footer)\b[^>]*>([^]*?)<\/\1>/gi)].entries()) {
    add(`brand-${index}`, "branding", text(match[2]));
    if (["header", "footer"].includes(match[1].toLowerCase())) {
      for (const [childIndex, child] of [...match[2].matchAll(/<(strong|span)\b([^>]*)>([^]*?)<\/\1>/gi)].entries()) {
        if (child[1].toLowerCase() === "strong" || attributesFromTag(child[2]).get("class")?.split(/\s+/).includes("eyebrow")) {
          add(`short-name-${index}-${childIndex}`, "branding", text(child[3]));
        }
      }
    }
  }
  for (const [index, match] of [...readable.matchAll(/<[a-z][^>]*>/gi)].entries()) {
    const attributes = attributesFromTag(match[0]);
    for (const name of ["href", "src", "action", "poster"]) {
      if (attributes.has(name)) add(`attr-${index}-${name}`, "url", attributes.get(name)!);
    }
    for (const name of ["aria-label", "alt", "title"]) {
      if (!attributes.has(name)) continue;
      add(`name-${index}-${name}`, "public-text", attributes.get(name)!);
      add(`name-url-${index}-${name}`, "url", attributes.get(name)!);
    }
    if (match[0].match(/^<meta\b/i)) {
      const content = attributes.get("content") ?? "";
      add(`meta-${index}`, "public-text", content);
      add(`meta-url-${index}`, "url", content);
      if (["og:site_name", "og:title", "twitter:title", "twitter:site"].includes(attributes.get("property") ?? attributes.get("name") ?? "")) {
        add(`meta-brand-${index}`, "branding", content);
      }
    }
  }
  for (const [index, match] of [...html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)].entries()) {
    if (attributesFromTag(match[1]).get("type") !== "application/ld+json") continue;
    const parsed: unknown = JSON.parse(match[2]);
    for (const [field, value] of strings(parsed).entries()) {
      add(`json-${index}-${field}`, "public-text", value);
      add(`json-url-${index}-${field}`, "url", value);
    }
    const graph = parsed && typeof parsed === "object" && "@graph" in parsed ? parsed["@graph"] : undefined;
    if (graph !== undefined && !Array.isArray(graph)) throw new Error("PP-02 unreadable JSON-LD graph.");
    const nodes = Array.isArray(parsed) ? parsed : graph ?? [parsed];
    for (const [nodeIndex, node] of nodes.entries()) {
      if (node && typeof node === "object" && "@type" in node && node["@type"] === "WebSite" && "name" in node && typeof node.name === "string") {
        add(`json-brand-${index}-${nodeIndex}`, "branding", node.name);
      }
    }
  }
  return surfaces;
}

export function collectSourceResidueSignals(input: {
  config: GameConfig;
  pages: PageInventoryEntry[];
  contentEntries: ContentEntryReference[];
  legalContent: unknown;
  purpose: "final" | "evidence";
}): ResidueSignals {
  const { config, pages, contentEntries, legalContent, purpose } = input;
  const surfaces: ResidueSurface[] = [];
  const add = (id: string, scope: ResidueScope, text: string) => surfaces.push({ id, scope, text });
  for (const [id, value] of Object.entries({ name: config.brand.name, shortName: config.brand.shortName,
    social: config.social.xHandle ?? "", title: config.seo.defaultTitle, template: config.seo.titleTemplate })) add(`config:${id}`, "branding", value);
  add("config:site", "url", config.site.url);
  add("config:copy", "public-text", [config.brand.tagline, config.seo.defaultDescription,
    ...config.navigation.groups.map((group) => "label" in group ? group.label : "")].join("\n"));
  add("config:copy-urls", "url", [config.brand.tagline, config.seo.defaultDescription,
    ...config.navigation.groups.map((group) => "label" in group ? group.label : "")].join("\n"));
  for (const page of pages) {
    const copy = [page.title, page.description];
    if (page.pageType === "about") copy.push(...strings(getStaticPageCopy("about")));
    if (["privacy", "terms"].includes(page.pageType) && legalContent && typeof legalContent === "object") {
      copy.push(...strings((legalContent as Record<string, unknown>)[page.pageType]));
    }
    const content = contentEntries.find((entry) => entry.data.pageId === page.pageId);
    if (content?.body !== undefined) copy.push(String(content.body));
    copy.push(...strings(projectPublicSources(page.sources)));
    add(`page:${page.pageId}:copy`, "public-text", copy.join("\n"));
    add(`page:${page.pageId}:urls`, "url", copy.join("\n"));
    add(`page:${page.pageId}:title`, "branding", page.title);
  }
  return scanResidueSurfaces(surfaces, surfaces.map(({ id }) => id), purpose, config.residueSentinels);
}
