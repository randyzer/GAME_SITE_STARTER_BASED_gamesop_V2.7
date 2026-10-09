import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import React from "react";
import { renderToString } from "react-dom/server";

import { describe, expect, it } from "vitest";

import EntityDatabase from "../src/components/EntityDatabase.astro";
import { pageInventory } from "../src/core/site-data";

const componentUrls = {
  entityDatabase: new URL(
    "../src/components/EntityDatabase.astro",
    import.meta.url,
  ),
  wikiArticle: new URL(
    "../src/components/wiki/WikiArticle.astro",
    import.meta.url,
  ),
  editorialArticle: new URL(
    "../src/components/EditorialArticle.astro",
    import.meta.url,
  ),
  entityDetail: new URL(
    "../src/components/EntityDetail.astro",
    import.meta.url,
  ),
  guideRoute: new URL(
    "../src/pages/guides/[...slug].astro",
    import.meta.url,
  ),
  toolShell: new URL(
    "../src/components/ToolShell.astro",
    import.meta.url,
  ),
  toolDefinitions: new URL(
    "../src/core/tool-definitions.ts",
    import.meta.url,
  ),
};

function source(url: URL) {
  return readFileSync(url, "utf8");
}

function template(url: URL) {
  return source(url).split("---").slice(2).join("---");
}

describe("player-facing metadata", () => {
  it("keeps internal research labels out of public article and entity markup", () => {
    const forbiddenLabels =
      /Priority|Confidence|Search Signal|>Signal<|Internal tags|Filed under|Editorial brief|Evidence ledger|Provenance ledger|Current fact set|Formula ledger|before this route is published|Facts are generated from one validated module file|Module index/i;

    for (const url of Object.values(componentUrls)) {
      expect(template(url)).not.toMatch(forbiddenLabels);
    }
  });

  it("removes internal sorting fields from the Guide Hub presentation", () => {
    const guideRoute = template(componentUrls.guideRoute);

    expect(guideRoute).not.toMatch(
      /guide\.priority|guide\.primaryKeyword|guide\.cluster/,
    );
    expect(guideRoute).toContain("Guide library");
    expect(guideRoute).toContain("Last updated");
  });

  it("uses shared player-facing primitives for editorial and entity pages", () => {
    const editorial = source(componentUrls.editorialArticle);
    const entity = source(componentUrls.entityDetail);

    expect(editorial).toContain("<Sources");
    expect(editorial).toContain("<RelatedPages");
    expect(editorial).not.toContain("sectionDescription");
    expect(entity).toContain("<QuickFacts");
    expect(entity).toContain("<Sources");
    expect(entity).toContain("<RelatedPages");
  });

  it("does not render internal source evidence notes from reusable public renderers", () => {
    const forbiddenSourceMetadata =
      /evidenceNote|internal reviewer|planning evidence|workflow state|approval state|gate state/i;

    expect(template(componentUrls.wikiArticle)).not.toMatch(forbiddenSourceMetadata);
    expect(template(componentUrls.editorialArticle)).not.toMatch(forbiddenSourceMetadata);
    expect(template(componentUrls.entityDetail)).not.toMatch(forbiddenSourceMetadata);
    expect(template(componentUrls.toolShell)).not.toMatch(forbiddenSourceMetadata);
    expect(source(componentUrls.toolShell)).toContain("sourceType");
    expect(source(componentUrls.toolShell)).toContain("sourceUrl");
    expect(source(componentUrls.toolShell)).toContain("accessedAt");
    expect(source(componentUrls.toolDefinitions)).not.toContain("../data/schemas/tools");
  });

  it.each(["hub", "database"] as const)(
    "keeps implementation wording out of rendered entity %s output",
    async (view) => {
      const container = await AstroContainer.create();
      container.addServerRenderer({
        renderer: {
          name: "@astrojs/react",
          check: async () => true,
          async renderToStaticMarkup(Component, props) {
            return {
              attrs: {},
              html: renderToString(React.createElement(Component, props)),
            };
          },
        },
      });
      container.addClientRenderer({
        name: "@astrojs/react",
        entrypoint: "@astrojs/react/client.js",
      });
      const html = await container.renderToString(EntityDatabase, {
        props: {
          page: {
            ...pageInventory[0],
            pageId: "heroes.hub",
            route: "/heroes/",
            title: "Heroes",
            description: "Browse heroes and compare their abilities.",
          },
          entityLabel: "Heroes",
          view,
          rows: [{
            id: "test-hero",
            name: "Test Hero",
            summary: "A hero used for rendering checks.",
            classification: "Support",
            detail: "Restores health",
            patch: "1.0",
          }],
        },
      });

      expect(html).toContain("Test Hero");
      expect(html.replace(/<!--.*?-->/g, "")).toContain("Filter Heroes");
      expect(html).toContain("<astro-island");
      expect(html).toContain("Scroll horizontally on narrow screens.");
      expect(html).not.toMatch(
        /EntityDatabase|Facts are generated from one validated module file|Module index|current fact dataset|evidenceNote|INTERNAL_TOOL_EVIDENCE_LEAK_MARKER|INTERNAL_EVIDENCE_NOTE_MARKER/i,
      );
    },
  );
});


it("does not equate source access with verification or recorded patch with current game version", () => {
  for (const url of [componentUrls.editorialArticle, componentUrls.wikiArticle]) {
    expect(template(url)).not.toContain("Last verified");
    expect(template(url)).toContain("Sources checked");
  }
  const sources = readFileSync(new URL("../src/components/wiki/Sources.astro", import.meta.url), "utf8");
  expect(sources).not.toContain("Last verified");
  expect(sources).toContain("Sources checked");
  const detail = template(componentUrls.entityDetail);
  expect(detail).not.toMatch(/Current version|Current patch/);
  expect(detail).toContain("Recorded version");
  expect(detail).toContain("Recorded patch");
});
