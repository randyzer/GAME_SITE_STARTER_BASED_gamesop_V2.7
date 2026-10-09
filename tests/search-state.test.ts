import { describe, expect, it } from "vitest";

import {
  buildSearchLocation,
  normalizeSearchResult,
  readSearchQuery,
} from "../src/core/search-state";

describe("search state", () => {
  it("reads and bounds a trimmed query from the URL", () => {
    expect(readSearchQuery("?q=%20Configure%20")).toBe("Configure");
    expect(readSearchQuery("?q=%20%20")).toBe("");
    expect(readSearchQuery(`?q=${"a".repeat(140)}`)).toHaveLength(120);
  });

  it("builds a stable same-page search location", () => {
    expect(buildSearchLocation("configure starter")).toBe(
      "/search/?q=configure+starter",
    );
    expect(buildSearchLocation("  ")).toBe("/search/");
  });

  it("normalizes local Pagefind results and strips markup", () => {
    expect(
      normalizeSearchResult({
        url: "/guides/getting-started/",
        meta: { title: "  Configure the starter  " },
        excerpt: "Use <mark>Page Inventory</mark> &amp; facts.",
      }),
    ).toEqual({
      url: "/guides/getting-started/",
      title: "Configure the starter",
      excerpt: "Use Page Inventory & facts.",
    });
  });

  it("uses readable fallbacks for missing result metadata", () => {
    expect(
      normalizeSearchResult({ url: "/guides/getting-started/" }),
    ).toEqual({
      url: "/guides/getting-started/",
      title: "Getting Started",
      excerpt: "Open this result to read the full page.",
    });
  });

  it("prefers the page description and bounds long snippets", () => {
    const result = normalizeSearchResult({
      url: "/guides/getting-started/",
      meta: { title: "Guide", description: `Focused ${"detail ".repeat(50)}` },
      excerpt: "Noisy excerpt",
    });

    expect(result?.excerpt.startsWith("Focused detail")).toBe(true);
    expect(result?.excerpt.length).toBeLessThanOrEqual(220);
    expect(result?.excerpt.endsWith("…")).toBe(true);
  });

  it("rejects external, protocol-relative, and malformed result URLs", () => {
    expect(normalizeSearchResult({ url: "https://example.com/" })).toBeNull();
    expect(normalizeSearchResult({ url: "//example.com/" })).toBeNull();
    expect(normalizeSearchResult({ url: "/../private/" })).toBeNull();
  });
});


describe("provider-neutral search outcomes", () => {
  type Provider = { search(query: string): Promise<Array<{ url: string; title: string; excerpt: string }>> };
  async function run(provider: Provider, query: string) {
    const module = await import("../src/core/search-state");
    const execute = Reflect.get(module, "runSearchProvider") as (provider: Provider, query: string) => Promise<unknown>;
    return execute(provider, query);
  }
  it("returns explicit results using the normalized query", async () => {
    const results = [{ url: "/guides/getting-started/", title: "Guide", excerpt: "Steps" }];
    const queries: string[] = [];
    expect(await run({ search: async query => { queries.push(query); return results; } }, "  Configure  ")).toEqual({ status: "results", query: "Configure", results });
    expect(queries).toEqual(["Configure"]);
  });
  it("distinguishes zero results from provider failure", async () => {
    expect(await run({ search: async () => [] }, "missing")).toEqual({ status: "empty", query: "missing", results: [] });
    expect(await run({ search: async () => { throw new Error("private provider details"); } }, "missing")).toEqual({ status: "error", query: "missing", results: [] });
  });
  it("handles a synchronous provider throw without exposing internal errors", async () => {
    expect(await run({ search: () => { throw new Error("private synchronous error"); } }, "term")).toEqual({ status: "error", query: "term", results: [] });
  });
  it("bounds the query before invoking the provider", async () => {
    let actual = "";
    const outcome = await run({ search: async query => { actual = query; return []; } }, " " + "a".repeat(140) + " ");
    expect(actual).toHaveLength(120);
    expect(outcome).toEqual({ status: "empty", query: "a".repeat(120), results: [] });
  });
  it("does not call a provider for a blank normalized query", async () => {
    let calls = 0;
    expect(await run({ search: async () => { calls++; return []; } }, "   ")).toEqual({ status: "empty", query: "", results: [] });
    expect(calls).toBe(0);
  });
});
