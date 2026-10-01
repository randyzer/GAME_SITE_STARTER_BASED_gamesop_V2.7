import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readContentEntriesFromDirectory } from "../src/core/content-files";
import { pageInventory } from "../src/core/site-data";

describe("readContentEntriesFromDirectory", () => {
  it("reads every project guide id and pageId from MDX frontmatter", () => {
    const guideDirectory = fileURLToPath(
      new URL("../src/content/guides", import.meta.url),
    );

    const entries = readContentEntriesFromDirectory(guideDirectory, "guides");
    expect(entries.every((entry) => typeof entry.body === "string" && !entry.body.startsWith("---"))).toBe(true);
    expect(entries.map(({ body, ...entry }) => entry)).toEqual(
      pageInventory
        .flatMap((page) =>
          page.contentRef?.collection === "guides"
            ? [
                {
                  collection: "guides",
                  id: page.contentRef.slug,
                  data: { pageId: page.pageId },
                },
              ]
            : [],
        )
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  });
});
