import { describe, expect, it } from "vitest";

import { defineGameConfig } from "../src/config/schema";
import {
  buildArticleSchema,
  buildBaseSeoGraph,
  buildBreadcrumbSchema,
  buildBreadcrumbTrail,
  buildCanonicalUrl,
  buildRobotsTxt,
  collectStructuredIdentityErrors,
  getSitemapRoutes,
  resolveStructuredIdentity,
  serializeJsonLd,
} from "../src/core/seo";
import {
  enabledPageCatalog,
  pageInventory,
  siteConfig,
} from "../src/core/site-data";

const homePage = pageInventory.find((page) => page.pageId === "home")!;
const guideHub = pageInventory.find((page) => page.pageId === "hub.guides")!;
const guidePage = pageInventory.find(
  (page) => page.pageId === "guide.getting-started",
)!;
const guideCatalog = [homePage, guideHub, guidePage];

describe("technical SEO helpers", () => {
  it("selects only enabled, indexable routes for the sitemap", () => {
    expect(getSitemapRoutes(enabledPageCatalog)).toEqual(
      enabledPageCatalog
        .filter((page) => page.indexability === "index")
        .map((page) => page.route),
    );
  });

  it("builds canonical HTTPS URLs from inventory routes", () => {
    expect(buildCanonicalUrl(siteConfig, guideHub.route)).toBe(
      new URL(guideHub.route, siteConfig.site.url).href,
    );
  });

  it("derives breadcrumbs only from enabled route ancestors", () => {
    expect(buildBreadcrumbTrail(siteConfig, guidePage, guideCatalog)).toEqual([
      {
        name: siteConfig.brand.name,
        url: new URL(homePage.route, siteConfig.site.url).href,
      },
      {
        name: guideHub.title,
        url: new URL(guideHub.route, siteConfig.site.url).href,
      },
      {
        name: guidePage.title,
        url: new URL(guidePage.route, siteConfig.site.url).href,
      },
    ]);
  });

  it("builds one accurate base graph and page-specific schema nodes", () => {
    const trail = buildBreadcrumbTrail(siteConfig, guidePage, guideCatalog);
    const graph = [
      ...buildBaseSeoGraph(siteConfig, guidePage),
      buildBreadcrumbSchema(
        buildCanonicalUrl(siteConfig, guidePage.route),
        trail,
      ),
      buildArticleSchema(siteConfig, guidePage),
    ];

    expect(graph.map((node) => node["@type"])).toEqual([
      "WebSite",
      "WebPage",
      "BreadcrumbList",
      "Article",
    ]);
    expect(new Set(graph.flatMap((node) => node["@id"] ?? []))).toHaveLength(4);
    expect(graph.find((node) => node["@type"] === "WebSite")).not.toHaveProperty("publisher");
    expect(graph.at(-1)).not.toHaveProperty("author");
    expect(graph.at(-1)).not.toHaveProperty("publisher");
    expect(graph.at(-1)).not.toHaveProperty("image");
  });

  it("serializes JSON-LD without allowing a script-closing sequence", () => {
    expect(serializeJsonLd({ value: "</script><script>alert(1)</script>" }))
      .not.toContain("</script>");
  });

  it("generates robots text from the configured production URL", () => {
    expect(buildRobotsTxt(siteConfig)).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${siteConfig.site.url}/sitemap-index.xml\n`,
    );
  });
  it("keeps entity existence independent from publisher and author roles", () => {
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        organization: { kind: "Organization", name: "Atlas Studio", projectConfirmed: true, evidenceRef: "entity:studio" },
      },
    });
    const base = buildBaseSeoGraph(config, guidePage);
    const article = buildArticleSchema(config, guidePage);
    expect(base.map((node) => node["@type"])).toEqual(["Organization", "WebSite", "WebPage"]);
    expect(base.find((node) => node["@type"] === "WebSite")).not.toHaveProperty("publisher");
    expect(article).not.toHaveProperty("author");
    expect(article).not.toHaveProperty("publisher");
  });

  it("emits only explicitly selected independent identity roles", () => {
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        sitePublisher: {
          identity: { kind: "Organization", name: "Site Publisher", projectConfirmed: true, evidenceRef: "entity:site-publisher" },
          evidenceRef: "role:site-publisher",
        },
        articles: {
          [guidePage.pageId]: {
            author: {
              identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
              evidenceRef: "role:author",
            },
            publisher: {
              identity: { kind: "Organization", name: "Article Publisher", projectConfirmed: true, evidenceRef: "entity:article-publisher" },
              evidenceRef: "role:article-publisher",
            },
          },
        },
      },
    });
    const base = buildBaseSeoGraph(config, guidePage);
    const article = buildArticleSchema(config, guidePage);
    const resolved = resolveStructuredIdentity(config, guidePage);
    const website = base.find((node) => node["@type"] === "WebSite")!;
    expect(website.publisher).toEqual(resolved.sitePublisher);
    expect(article.author).toEqual(resolved.articleAuthor);
    expect(article.publisher).toEqual(resolved.articlePublisher);
    expect(resolved.authorAttribution?.name).toBe("Guide Author");
    expect(article.publisher).not.toEqual(website.publisher);
    expect(JSON.stringify([...base, article])).not.toContain("evidenceRef");
    expect(JSON.stringify([...base, article])).not.toContain("projectConfirmed");
  });

  it("does not inherit site publisher into an article", () => {
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        sitePublisher: {
          identity: { kind: "Organization", name: "Only Site Publisher", projectConfirmed: true, evidenceRef: "entity:publisher" },
          evidenceRef: "role:site",
        },
      },
    });
    expect(buildBaseSeoGraph(config, guidePage).find((node) => node["@type"] === "WebSite")).toHaveProperty("publisher");
    expect(buildArticleSchema(config, guidePage)).not.toHaveProperty("publisher");
    expect(buildArticleSchema(config, guidePage)).not.toHaveProperty("author");
  });

  it("guards the final graph against uncontrolled identity injection", () => {
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        articles: {
          [guidePage.pageId]: {
            author: {
              identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
              evidenceRef: "role:author",
            },
          },
        },
      },
    });
    const valid = {
      "@context": "https://schema.org",
      "@graph": [...buildBaseSeoGraph(config, guidePage), buildArticleSchema(config, guidePage)],
    };
    expect(collectStructuredIdentityErrors(config, guidePage, [valid])).toEqual([]);
    const injected = structuredClone(valid);
    (injected["@graph"] as unknown[]).push({ "@type": "Person", "@id": "https://gameatlas.example/#identity-unapproved", name: "Injected" });
    expect(collectStructuredIdentityErrors(config, guidePage, [injected]).join("\n")).toMatch(/unconfigured controlled identity/i);
    expect(collectStructuredIdentityErrors(siteConfig, guidePage, [{ "@id": "https://gameatlas.example/#organization" }]).join("\n")).toMatch(/dangling|legacy/i);
  });

  it("deduplicates explicitly identical identities and keeps entity IDs independent from role evidence", () => {
    const sharedIdentity = {
      kind: "Person" as const,
      name: "Shared Editor",
      projectConfirmed: true as const,
      evidenceRef: "entity:shared-editor",
    };
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        articles: {
          [guidePage.pageId]: {
            author: { identity: sharedIdentity, evidenceRef: "role:author-v1" },
            publisher: { identity: sharedIdentity, evidenceRef: "role:publisher-v1" },
          },
        },
      },
    });
    const resolved = resolveStructuredIdentity(config, guidePage);
    expect(resolved.nodes).toHaveLength(1);
    expect(resolved.articleAuthor).toEqual(resolved.articlePublisher);

    const changedRoleEvidence = defineGameConfig({
      ...siteConfig,
      identity: { articles: { [guidePage.pageId]: {
        author: { identity: sharedIdentity, evidenceRef: "role:author-v2" },
      } } },
    });
    expect(resolveStructuredIdentity(changedRoleEvidence, guidePage).articleAuthor).toEqual(resolved.articleAuthor);

    const changedEntityEvidence = defineGameConfig({
      ...siteConfig,
      identity: { articles: { [guidePage.pageId]: {
        author: { identity: { ...sharedIdentity, evidenceRef: "entity:different-evidence" }, evidenceRef: "role:author-v1" },
      } } },
    });
    expect(resolveStructuredIdentity(changedEntityEvidence, guidePage).articleAuthor).not.toEqual(resolved.articleAuthor);
  });

  it("rejects controlled role/type bypasses while allowing unrelated structured extensions", () => {
    const config = defineGameConfig({
      ...siteConfig,
      identity: { articles: { [guidePage.pageId]: { author: {
        identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
        evidenceRef: "role:author",
      } } } },
    });
    const graph = [...buildBaseSeoGraph(config, guidePage), buildArticleSchema(config, guidePage)];
    const valid = { "@context": "https://schema.org", "@graph": [...graph, { "@type": "CreativeWork", name: "Unrelated extension" }] };
    expect(collectStructuredIdentityErrors(config, guidePage, [valid])).toEqual([]);

    const stringRole = structuredClone(valid);
    const article = (stringRole["@graph"] as Record<string, unknown>[]).find((node) => node["@type"] === "Article")!;
    article.author = "Guide Author";
    expect(collectStructuredIdentityErrors(config, guidePage, [stringRole]).join("\n")).toMatch(/unsupported author/i);

    const typeArray = structuredClone(valid);
    const person = (typeArray["@graph"] as Record<string, unknown>[]).find((node) => node["@type"] === "Person")!;
    person["@type"] = ["Person", "Thing"];
    expect(collectStructuredIdentityErrors(config, guidePage, [typeArray]).join("\n")).toMatch(/exactly one controlled type/i);

    const duplicateIdentity = structuredClone(graph.find((node) => node["@type"] === "Person")!);
    expect(collectStructuredIdentityErrors(config, guidePage, [valid, duplicateIdentity]).join("\n")).toMatch(/exactly once/i);
  });

});
