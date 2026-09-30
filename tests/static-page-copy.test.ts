import { describe, expect, it } from "vitest";

import { getStaticPageCopy } from "../src/core/static-page-copy";

describe("getStaticPageCopy", () => {
  it("provides an evidence-led editorial method for the about page", () => {
    const copy = getStaticPageCopy("about");

    expect(copy.sections.map((section) => section.heading).join(" ")).toMatch(
      /sources|publishing|facts/i,
    );
    expect(copy.reviewNotice).toBeUndefined();
  });

  it.each(["privacy", "terms"] as const)(
    "provides no renderable starter fallback for %s",
    (pageType) => {
      expect(() => getStaticPageCopy(pageType)).toThrow(/legal.*content/i);
    },
  );
});
