import { describe, expect, it } from "vitest";

import {
  collectAdHtmlAuditErrors,
  collectBuildHtmlAuditErrors,
  collectReferencedAssetPaths,
} from "../src/core/html-audit";
import { defineAdsConfig } from "../src/config/ads";
import { defineGameConfig } from "../src/config/schema";
import { buildArticleSchema, buildBaseSeoGraph, resolveStructuredIdentity } from "../src/core/seo";
import {
  enabledPageCatalog,
  getPageByRoute,
  siteConfig,
} from "../src/core/site-data";
import { pageInventoryEntrySchema, type PageInventoryEntry } from "../src/data/schemas/page-inventory";


// Controlled-author tests own their article; catalog-wide audit tests keep real inputs.
const syntheticGuide = pageInventoryEntrySchema.parse({
  pageId: "guide.qa-html-author", route: "/guides/qa-html-author/", pageType: "guide",
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  title: "Synthetic HTML Author Audit Guide",
  description: "Synthetic article input for visible author attribution and additional script identity audits.",
  publishedAt: "2026-08-10", updatedAt: "2026-09-20", primaryKeyword: "synthetic html author",
  tags: ["testing"], relatedPageIds: [], relatedEntityRefs: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-html-author", sourceType: "editorial", accessedAt: "2026-09-21",
    evidenceNote: "Synthetic editorial source for structured author HTML audit tests." }],
});

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function validHtml(page: PageInventoryEntry, links: string[] = ["/"]) {
  const canonical = new URL(page.route, siteConfig.site.url).href;
  const robots =
    page.indexability === "index"
      ? "index, follow, max-image-preview:large"
      : "noindex, nofollow";
  const pagefind = page.indexability === "index" ? " data-pagefind-body" : "";

  return `<!doctype html>
    <html lang="en">
      <head>
        <title>${escapeHtml(page.title)}</title>
        <meta name="description" content="${escapeHtml(page.description)}">
        <meta name="robots" content="${robots}">
        <link rel="canonical" href="${canonical}">
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"}]}</script>
        <link rel="stylesheet" href="/_astro/site.css">
      </head>
      <body><main${pagefind}><h1>${escapeHtml(page.title)}</h1>${links.map((link) => `<a href="${link}">Link</a>`).join("")}<img src="/fixture.png" alt="Fixture"></main></body>
    </html>`;
}

function validCatalogHtml() {
  const indexableRoutes = enabledPageCatalog
    .filter((page) => page.indexability === "index")
    .map((page) => page.route);

  return new Map(
    enabledPageCatalog.map((page) => [
      page.route,
      validHtml(page, page.route === "/" ? indexableRoutes : ["/"]),
    ]),
  );
}

describe("generated HTML audit", () => {
  it("accepts a complete catalog with valid metadata and internal links", () => {
    expect(
      collectBuildHtmlAuditErrors({
        config: siteConfig,
        pages: enabledPageCatalog,
        htmlByRoute: validCatalogHtml(),
      }),
    ).toEqual([]);
  });

  it("reports page-level SEO, accessibility, and schema failures", () => {
    const page = getPageByRoute("/about/");
    const invalidHtml = validHtml(page)
      .replace(`<title>${page.title}</title>`, "<title></title>")
      .replace(page.description, "Wrong description")
      .replace('rel="canonical"', 'rel="alternate"')
      .replace("index, follow, max-image-preview:large", "noindex, nofollow")
      .replace("<h1", "<h2")
      .replace("</h1>", "</h2>")
      .replace('{"@context":"https://schema.org"', "{invalid")
      .replace(' alt="Fixture"', "")
      .replace('href="/"', 'href="/missing/"')
      .replace(" data-pagefind-body", "");
    const errors = collectBuildHtmlAuditErrors({
      config: siteConfig,
      pages: [page],
      htmlByRoute: new Map([[page.route, invalidHtml]]),
    }).join("\n");

    expect(errors).toMatch(/title/i);
    expect(errors).toMatch(/description/i);
    expect(errors).toMatch(/canonical/i);
    expect(errors).toMatch(/robots/i);
    expect(errors).toMatch(/one h1/i);
    expect(errors).toMatch(/json-ld/i);
    expect(errors).toMatch(/pagefind/i);
    expect(errors).toMatch(/alt/i);
    expect(errors).toMatch(/missing/i);
  });

  it("keeps global image alt validation for logo and non-media images", () => {
    const page = getPageByRoute("/");
    const invalidLogoHtml = validHtml(page).replace(
      '<img src="/fixture.png" alt="Fixture">',
      '<img class="brand__logo" src="/logo.svg">',
    );

    const errors = collectBuildHtmlAuditErrors({
      config: siteConfig,
      pages: [page],
      htmlByRoute: new Map([[page.route, invalidLogoHtml]]),
    }).join("\n");

    expect(errors).toMatch(/Every image must declare an alt attribute/i);
  });

  it("reports duplicate metadata and orphaned indexable pages", () => {
    const home = getPageByRoute("/");
    const about = getPageByRoute("/about/");
    const duplicateAbout = {
      ...about,
      title: home.title,
      description: home.description,
    };
    const errors = collectBuildHtmlAuditErrors({
      config: siteConfig,
      pages: [home, duplicateAbout],
      htmlByRoute: new Map([
        [home.route, validHtml(home, ["/"])],
        [duplicateAbout.route, validHtml(duplicateAbout, ["/"])],
      ]),
    }).join("\n");

    expect(errors).toMatch(/duplicate title/i);
    expect(errors).toMatch(/duplicate description/i);
    expect(errors).toMatch(/orphaned.*about/i);
  });


  it("accepts configured structured author only when graph and visible attribution match", () => {
    const home = getPageByRoute("/");
    const guide = syntheticGuide;
    const config = defineGameConfig({
      ...siteConfig,
      identity: {
        articles: {
          [guide.pageId]: {
            author: {
              identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
              evidenceRef: "role:author",
            },
          },
        },
      },
    });
    const resolved = resolveStructuredIdentity(config, guide);
    const document = {
      "@context": "https://schema.org",
      "@graph": [...buildBaseSeoGraph(config, guide), buildArticleSchema(config, guide)],
    };
    const guideHtml = validHtml(guide, ["/"])
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(document)}</script>`)
      .replace(`<h1>${escapeHtml(guide.title)}</h1>`, `<header class="article__header"><dl><div><dt>Author</dt><dd data-structured-author-id="${resolved.authorAttribution!.id}">Guide Author</dd></div></dl></header><h1>${escapeHtml(guide.title)}</h1>`);
    const htmlByRoute = new Map([
      [home.route, validHtml(home, [guide.route])],
      [guide.route, guideHtml],
    ]);
    expect(collectBuildHtmlAuditErrors({ config, pages: [home, guide], htmlByRoute })).toEqual([]);
  });

  it("rejects additional-script identity injection and mismatched visible author", () => {
    const home = getPageByRoute("/");
    const guide = syntheticGuide;
    const config = defineGameConfig({
      ...siteConfig,
      identity: { articles: { [guide.pageId]: { author: {
        identity: { kind: "Person", name: "Guide Author", projectConfirmed: true, evidenceRef: "entity:author" },
        evidenceRef: "role:author",
      } } } },
    });
    const resolved = resolveStructuredIdentity(config, guide);
    const document = { "@context": "https://schema.org", "@graph": [...buildBaseSeoGraph(config, guide), buildArticleSchema(config, guide)] };
    const baseGuideHtml = validHtml(guide, ["/"])
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(document)}</script>`)
      .replace(`<h1>${escapeHtml(guide.title)}</h1>`, `<header class="article__header"><dl><div><dt>Author</dt><dd data-structured-author-id="${resolved.authorAttribution!.id}">Guide Author</dd></div></dl></header><h1>${escapeHtml(guide.title)}</h1>`);
    const injected = baseGuideHtml.replace("</head>", '<script type="application/ld+json">{"@type":"Person","@id":"https://gameatlas.example/#identity-injected","name":"Injected"}</script></head>');
    const mismatch = baseGuideHtml.replace(">Guide Author</dd>", ">Wrong Author</dd>");
    const hidden = baseGuideHtml.replace(
      '<div><dt>Author</dt><dd data-structured-author-id=',
      '<div hidden><dt>Author</dt><dd data-structured-author-id=',
    );
    for (const [html, expected] of [
      [injected, /unconfigured controlled identity/i],
      [mismatch, /visible author attribution/i],
      [hidden, /must not be explicitly hidden/i],
    ] as const) {
      const errors = collectBuildHtmlAuditErrors({
        config, pages: [home, guide],
        htmlByRoute: new Map([[home.route, validHtml(home, [guide.route])], [guide.route, html]]),
      }).join("\n");
      expect(errors).toMatch(expected);
    }
  });

  it("collects only local build assets referenced by HTML", () => {
    expect(
      collectReferencedAssetPaths(`
        <link rel="stylesheet" href="/_astro/site.css">
        <script src="/_astro/app.js"></script>
        <astro-island component-url="/_astro/island.js" renderer-url="/_astro/client.js"></astro-island>
        <script src="https://cdn.example/app.js"></script>
      `),
    ).toEqual([
      "/_astro/app.js",
      "/_astro/client.js",
      "/_astro/island.js",
      "/_astro/site.css",
    ]);
  });

  it("rejects any semantic ad residue while ads are globally disabled", () => {
    const disabled = defineAdsConfig({ enabled: false, placements: {} });
    const errors = collectAdHtmlAuditErrors(
      new Map([
        [
          "/",
          '<section data-ad-placement="home-primary"><div data-ad-instance="home-primary-1"></div></section>',
        ],
      ]),
      disabled,
    );

    expect(errors.join("\n")).toMatch(/disabled.*ad-specific output/i);
  });

  it("rejects duplicate placement, instance, and bootstrap identities on one page", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const repeated = `
      <section data-ad-placement="home-primary"><div data-ad-instance="home-primary-1"></div></section>
      <section data-ad-placement="home-primary"><div data-ad-instance="home-primary-1"></div></section>
      <script data-ad-bootstrap="project-bootstrap"></script>
      <script data-ad-bootstrap="project-bootstrap"></script>`;

    const errors = collectAdHtmlAuditErrors(new Map([["/", repeated]]), enabled).join("\n");

    expect(errors).toMatch(/duplicate.*placement.*home-primary/i);
    expect(errors).toMatch(/duplicate.*instance.*home-primary-1/i);
    expect(errors).toMatch(/duplicate.*bootstrap.*project-bootstrap/i);
  });

  it("rejects a duplicate external bootstrap when one copy omits the marker", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1"></div>
      </section>
      <script data-ad-bootstrap="project-bootstrap" src="/provider-bootstrap.js"></script>
      <script src="/provider-bootstrap.js"></script>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled).join("\n")).toMatch(
      /duplicate.*bootstrap.*provider-bootstrap\.js/i,
    );
  });

  it("requires one provider instance per enabled semantic wrapper", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });

    const errors = collectAdHtmlAuditErrors(
      new Map([["/", '<section data-ad-placement="home-primary"></section>']]),
      enabled,
    );

    expect(errors.join("\n")).toMatch(/provider instance/i);
  });

  it("validates provider roots within each wrapper instead of by page-wide totals", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
        "before-footer": {
          enabled: true,
          instanceId: "before-footer-1",
          publicSlotId: "public-before-footer",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1"></div>
        <div data-ad-instance="before-footer-1"></div>
      </section>
      <section data-ad-placement="before-footer"></section>`;

    const errors = collectAdHtmlAuditErrors(new Map([["/", html]]), enabled).join("\n");

    expect(errors).toMatch(/home-primary.*exactly one provider instance.*found 2/i);
    expect(errors).toMatch(/before-footer.*exactly one provider instance.*found 0/i);
  });

  it("rejects a provider root outside a semantic ad wrapper", () => {
    const enabled = defineAdsConfig({ enabled: true, placements: {} });

    expect(
      collectAdHtmlAuditErrors(
        new Map([["/", '<div data-ad-instance="orphan-provider-root"></div>']]),
        enabled,
      ).join("\n"),
    ).toMatch(/orphan.*provider instance.*orphan-provider-root/i);
  });

  it("requires the wrapper provider root to match its configured instance identity", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="wrong-provider-instance"></div>
      </section>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled).join("\n")).toMatch(
      /home-primary.*does not match configured identity.*wrong-provider-instance/i,
    );
  });

  it("requires a stable identity for inline provider bootstrap inside a wrapper", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1"></div>
        <script>globalThis.providerBootstrap = true;</script>
      </section>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled).join("\n")).toMatch(
      /inline ad bootstrap.*stable.*data-ad-bootstrap/i,
    );
  });

  it("accepts multiple valid wrappers and ignores unrelated duplicate scripts", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
        "before-footer": {
          enabled: true,
          instanceId: "before-footer-1",
          publicSlotId: "public-before-footer",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1"></div>
      </section>
      <section data-ad-placement="before-footer">
        <div data-ad-instance="before-footer-1"></div>
      </section>
      <script data-ad-bootstrap="project-bootstrap" src="/provider-bootstrap.js"></script>
      <script src="/unrelated-app.js"></script>
      <script src="/unrelated-app.js"></script>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled)).toEqual([]);
  });

  it("accepts one configured semantic placement and provider instance", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1"></div>
      </section>
      <script data-ad-bootstrap="project-bootstrap"></script>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled)).toEqual([]);
  });

  it("rejects private credential-shaped ad attributes", () => {
    const enabled = defineAdsConfig({
      enabled: true,
      placements: {
        "home-primary": {
          enabled: true,
          instanceId: "home-primary-1",
          publicSlotId: "public-home-primary",
        },
      },
    });
    const html = `
      <section data-ad-placement="home-primary">
        <div data-ad-instance="home-primary-1" data-ad-api-key="private-value"></div>
      </section>`;

    expect(collectAdHtmlAuditErrors(new Map([["/", html]]), enabled).join("\n")).toMatch(
      /private credential/i,
    );
  });
});
