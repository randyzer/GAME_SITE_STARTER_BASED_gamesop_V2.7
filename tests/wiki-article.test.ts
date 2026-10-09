import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import WikiArticle from "../src/components/wiki/WikiArticle.astro";
import { selectWikiArticleHeadings } from "../src/components/wiki/wiki-article";
import { pageInventoryEntrySchema } from "../src/data/schemas/page-inventory";


// Rendering tests own their guide; a real adoption need not include a setup article.
const syntheticGuide = pageInventoryEntrySchema.parse({
  pageId: "guide.qa-wiki", route: "/guides/qa-wiki/", pageType: "guide",
  cluster: "guides", module: "guides", feature: "guides", priority: 90,
  visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  title: "Synthetic Wiki Article Test Guide",
  description: "Synthetic guide input for FAQ, TOC, structured identity and independent date projection.",
  publishedAt: "2026-08-10", updatedAt: "2026-09-20", primaryKeyword: "synthetic wiki article",
  tags: ["testing"], relatedPageIds: ["hub.guides"], relatedEntityRefs: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-wiki", sourceType: "editorial", accessedAt: "2026-09-21",
    evidenceNote: "Synthetic editorial source for wiki article rendering contract tests." }],
});

const wikiArticleUrl = new URL(
  "../src/components/wiki/WikiArticle.astro",
  import.meta.url,
);
const quickFactsUrl = new URL(
  "../src/components/wiki/QuickFacts.astro",
  import.meta.url,
);
const sourcesUrl = new URL(
  "../src/components/wiki/Sources.astro",
  import.meta.url,
);
const relatedPagesUrl = new URL(
  "../src/components/wiki/RelatedPages.astro",
  import.meta.url,
);
const faqUrl = new URL("../src/components/wiki/FAQ.astro", import.meta.url);
const contentConfigUrl = new URL("../src/content.config.ts", import.meta.url);
const guideRouteUrl = new URL(
  "../src/pages/guides/[...slug].astro",
  import.meta.url,
);

function source(url: URL) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("WikiArticle", () => {
  it("uses only H2 and H3 body headings returned by the content renderer", () => {
    const headings = [
      { depth: 1, slug: "page-title", text: "Page title" },
      { depth: 2, slug: "start", text: "Start here" },
      { depth: 3, slug: "details", text: "Useful details" },
      { depth: 4, slug: "aside", text: "Deep aside" },
    ];

    expect(selectWikiArticleHeadings(headings)).toEqual([
      { depth: 2, slug: "start", text: "Start here" },
      { depth: 3, slug: "details", text: "Useful details" },
    ]);
  });

  it("does not use a title blacklist when selecting body headings", () => {
    const headings = [
      { depth: 2, slug: "sources-in-body", text: "Sources" },
      { depth: 3, slug: "related-in-body", text: "Related Pages" },
    ];

    expect(selectWikiArticleHeadings(headings)).toEqual(headings);
  });

  it("keeps component-owned headings outside the renderer heading input", () => {
    const wikiArticle = source(wikiArticleUrl);

    expect(wikiArticle).toContain("selectWikiArticleHeadings(headings)");
    expect(wikiArticle).toContain("<QuickFacts");
    expect(wikiArticle).toContain("<RelatedPages");
    expect(wikiArticle).toContain("<Sources");
    expect(wikiArticle).toContain("<FAQ");
    expect(wikiArticle).not.toMatch(
      /querySelector|querySelectorAll|DOMParser|parseHTML|rehype|titleBlacklist/,
    );
  });

  it("hides optional primitives when their input is empty", () => {
    expect(source(quickFactsUrl)).toContain("items.length > 0 &&");
    expect(source(relatedPagesUrl)).toContain("pages.length > 0 &&");
    expect(source(sourcesUrl)).toContain("Sources & verification");
    expect(source(faqUrl)).toContain("items.length > 0 &&");
  });

  it("routes guide articles through WikiArticle with renderer headings", () => {
    const guideRoute = source(guideRouteUrl);

    expect(guideRoute).toMatch(
      /import WikiArticle from ["']\.\.\/\.\.\/components\/wiki\/WikiArticle\.astro["']/,
    );
    expect(guideRoute).toMatch(
      /<WikiArticle\s+page=\{page\}\s+headings=\{rendered\?\.headings\}\s+faq=\{record\.content\.data\.faq\}\s*>/,
    );
    expect(guideRoute).toContain("{Content && <Content />}");
    expect(guideRoute).toContain("faq={record.content.data.faq}");
  });

  it("keeps existing pageId-only content valid with an optional authored FAQ field", () => {
    const contentConfig = source(contentConfigUrl);

    expect(contentConfig).toMatch(/pageId:[\s\S]*faq:/);
    expect(contentConfig).toMatch(/faq:\s*z\.array\([\s\S]*?\)\.optional\(\)/);
    expect(contentConfig).not.toMatch(/FAQPage|jsonLd|structuredData/);
  });

  it("renders FAQ after body content without adding its heading to the body TOC", async () => {
    const page = syntheticGuide;
    const container = await AstroContainer.create();
    const html = await container.renderToString(WikiArticle, {
      props: {
        page,
        headings: [
          { depth: 2, slug: "body-start", text: "Body start" },
          { depth: 3, slug: "body-detail", text: "Body detail" },
        ],
        faq: [
          {
            question: "Does this question enter the TOC?",
            answer: "No. It is component-owned visible content.",
          },
        ],
      },
      slots: {
        default:
          '<h2 id="body-start">Body start</h2><h3 id="body-detail">Body detail</h3>',
      },
    });
    const toc =
      html.match(/<nav aria-labelledby="wiki-toc-title">([\s\S]*?)<\/nav>/)?.[1] ?? "";

    expect(toc).toContain('href="#body-start"');
    expect(toc).toContain('href="#body-detail"');
    expect(toc).not.toMatch(/FAQ|Does this question/);
    expect(html).toContain("Does this question enter the TOC?");
    expect(html.indexOf('id="body-detail"')).toBeLessThan(
      html.indexOf("Does this question enter the TOC?"),
    );
    expect(html.indexOf("Does this question enter the TOC?")).toBeLessThan(
      html.indexOf('class="related-pages next-dispatch"'),
    );
    expect(html.indexOf('class="related-pages next-dispatch"')).toBeLessThan(
      html.indexOf('class="sources evidence section-rule"'),
    );
  });
  it("uses the structured identity resolver and emits no default author attribution", async () => {
    const wikiArticle = source(wikiArticleUrl);
    expect(wikiArticle).toContain("resolveStructuredIdentity(siteConfig, page).authorAttribution");
    expect(wikiArticle).toContain("data-structured-author-id");
    const page = syntheticGuide;
    const container = await AstroContainer.create();
    const html = await container.renderToString(WikiArticle, { props: { page }, slots: { default: "<p>Body</p>" } });
    expect(html).not.toContain("data-structured-author-id");
    expect(html).not.toMatch(/<dt>Author<\/dt>/);
  });

});


it("renders independent freshness dates without live metadata", async () => {
  const page = { ...syntheticGuide, publishedAt: "2026-08-10", updatedAt: "2026-09-20", sources: [
    { sourceUrl: "https://example.com/qa-a", sourceType: "editorial" as const, accessedAt: "2026-09-18", evidenceNote: "Private synthetic source access evidence" },
    { sourceUrl: "https://example.com/qa-b", sourceType: "editorial" as const, accessedAt: "2026-09-21", evidenceNote: "Private synthetic source access evidence B" },
  ] };
  const container = await AstroContainer.create();
  const html = (await container.renderToString(WikiArticle, { props: { page, sectionLabel: "QA article" }, slots: { default: "<p>Synthetic body</p>" } })).replace(/<!--.*?-->/g, "");
  expect(html).toMatch(/<dt>Published<\/dt>[\s\S]*?<time datetime="2026-08-10"/);
  expect(html).toMatch(/<dt>Last updated<\/dt>[\s\S]*?<time datetime="2026-09-20"/);
  expect(html).toMatch(/<dt>Sources checked<\/dt>[\s\S]*?<time datetime="2026-09-21"/);
  expect(html).not.toMatch(/<dt>Live status<\/dt>|Observed live|Status source|Not live telemetry|Last verified|Live now|Currently live|Private synthetic source access evidence/);
  expect(html).toContain('"datePublished":"2026-08-10"');
  expect(html).toContain('"dateModified":"2026-09-20"');
});

it("does not render live metadata for existing pages", async () => {
  const page = syntheticGuide;
  const container = await AstroContainer.create();
  const html = await container.renderToString(WikiArticle, { props: { page, sectionLabel: "QA article" }, slots: { default: "<p>Body</p>" } });
  expect(html).not.toMatch(/Observed live|Status source|Not live telemetry|<dt>Live status<\/dt>/);
});
