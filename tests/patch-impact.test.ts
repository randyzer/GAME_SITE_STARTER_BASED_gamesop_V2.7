import { describe, expect, it } from "vitest";

import {
  findAffectedPageIds,
  parsePatchImpactArgs,
} from "../src/core/patch-impact";
import { parsePageInventory } from "../src/data/schemas/page-inventory";


// Impact analysis examples are test inputs, not required adoption facts or pages.
const base = {
  priority: 90, visibility: "public", publicationStatus: "published", contentStatus: "ready",
  developmentStatus: "ready", needsReview: false, needsUpdate: false, indexability: "index",
  publishedAt: "2026-08-10", updatedAt: "2026-09-20", tags: ["testing"], relatedPageIds: [], confidence: "high",
  sources: [{ sourceUrl: "https://example.com/qa-patch-impact", sourceType: "editorial", accessedAt: "2026-09-21",
    evidenceNote: "Synthetic editorial source for direct and related entity impact tests." }],
};
const [heroPage, guidePage] = parsePageInventory([
  { ...base, pageId: "hero.demo-sentinel", route: "/heroes/demo-sentinel/", pageType: "hero",
    cluster: "heroes", module: "heroes", feature: "heroes", title: "Synthetic Patch Impact Hero",
    description: "Synthetic direct entity consumer for testing affected page detection without mutating state.",
    primaryKeyword: "synthetic patch hero", entityRef: { entityType: "hero", entityId: "demo-sentinel" }, relatedEntityRefs: [] },
  { ...base, pageId: "guide.hero-counter", route: "/guides/hero-counter/", pageType: "guide",
    cluster: "guides", module: "guides", feature: "guides", title: "Synthetic Entity Counter Guide",
    description: "Synthetic related entity consumer for testing indirect impact and preserving workflow state.",
    primaryKeyword: "demo hero counter", relatedEntityRefs: [{ entityType: "hero", entityId: "demo-sentinel" }] },
]);

describe("findAffectedPageIds", () => {
  it("finds direct and related entity consumers without mutating workflow state", () => {
    const before = {
      updatedAt: guidePage.updatedAt,
      needsUpdate: guidePage.needsUpdate,
    };

    expect(
      findAffectedPageIds([heroPage, guidePage], [
        { entityType: "hero", entityId: "demo-sentinel" },
      ]),
    ).toEqual(["hero.demo-sentinel", "guide.hero-counter"]);
    expect({
      updatedAt: guidePage.updatedAt,
      needsUpdate: guidePage.needsUpdate,
    }).toEqual(before);
  });

  it("parses an explicit entity type and ID for the CLI", () => {
    expect(
      parsePatchImpactArgs([
        "--entity-type",
        "hero",
        "--entity-id",
        "demo-sentinel",
      ]),
    ).toEqual({ entityType: "hero", entityId: "demo-sentinel" });
    expect(() => parsePatchImpactArgs(["--entity-type", "hero"])).toThrow(
      /entity-id/i,
    );
    expect(() =>
      parsePatchImpactArgs([
        "--entity-type",
        "account",
        "--entity-id",
        "demo-sentinel",
      ]),
    ).toThrow(/entity-type/i);
  });
});
