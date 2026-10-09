import { describe, expect, it } from "vitest";

import { getStaticPageCopy } from "../src/core/static-page-copy";

describe("getStaticPageCopy", () => {
  it("provides an evidence-led editorial method for the about page", () => {
    const intro = "Bomb Farm Wiki explains its bounded source and editorial scope.";
    const copy = getStaticPageCopy("about", intro);

    expect(copy.intro).toBe(intro);

    expect(copy.sections.map((section) => section.heading).join(" ")).toMatch(
      /sources|publishing|facts/i,
    );
    expect(copy.reviewNotice).toBeUndefined();
  });

  it.each(["", "   "])("rejects a blank project About intro: %j", (intro) => {
    expect(() => getStaticPageCopy("about", intro)).toThrow(/intro/i);
  });

  it.each(["privacy", "terms"] as const)(
    "provides no renderable starter fallback for %s",
    (pageType) => {
      expect(() => getStaticPageCopy(pageType)).toThrow(/legal.*content/i);
    },
  );
});
