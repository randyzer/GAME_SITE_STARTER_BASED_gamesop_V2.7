import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import EditorialArticle from "../src/components/EditorialArticle.astro";
import { pageInventory } from "../src/core/site-data";

describe("EditorialArticle structured identity seam", () => {
  it("uses the shared resolver and has no default author attribution", async () => {
    const source = readFileSync(new URL("../src/components/EditorialArticle.astro", import.meta.url), "utf8");
    expect(source).toContain("resolveStructuredIdentity(siteConfig, page).authorAttribution");
    expect(source).toContain("data-structured-author-id");

    const page = pageInventory.find((entry) => entry.pageType === "meta" || entry.pageType === "patch");
    if (!page) return;
    const container = await AstroContainer.create();
    const html = await container.renderToString(EditorialArticle, {
      props: { page, sectionLabel: "Update" },
      slots: { default: "<p>Body</p>" },
    });
    expect(html).not.toContain("data-structured-author-id");
    expect(html).not.toMatch(/<dt>Author<\/dt>/);
  });
});
