import { describe, expect, it, vi } from "vitest";

interface Module {
  init(): Promise<void>;
  search(query: string): Promise<{ results: Array<{ data(): Promise<{ url: string; meta?: Record<string, string>; excerpt?: string }> }> }>;
}
async function create(module: Module) {
  const adapter = await import("../src/core/pagefind-search-adapter");
  return adapter.createPagefindSearchProvider(module);
}

describe("Pagefind provider edge", () => {
  it("initializes once and passes the query through its provider interface", async () => {
    const init = vi.fn(async () => {}), search = vi.fn(async () => ({ results: [] }));
    const provider = await create({ init, search });
    expect(init).toHaveBeenCalledTimes(1);
    await provider.search("Configure");
    await provider.search("Second");
    expect(init).toHaveBeenCalledTimes(1);
    expect(search.mock.calls).toEqual([["Configure"], ["Second"]]);
  });
  it("consumes at most20 hits and normalizes their title/excerpt", async () => {
    const hits = Array.from({ length: 25 }, (_, index) => ({ data: vi.fn(async () => ({ url: `/guides/item-${index}/`, meta: { title: "  Item  " }, excerpt: "A <mark>safe</mark> &amp; local answer" })) }));
    const provider = await create({ init: async () => {}, search: async () => ({ results: hits }) });
    const results = await provider.search("term");
    expect(results).toHaveLength(20);
    expect(results[0]).toEqual({ url: "/guides/item-0/", title: "Item", excerpt: "A safe & local answer" });
    expect(hits.slice(0, 20).every(hit => hit.data.mock.calls.length === 1)).toBe(true);
    expect(hits.slice(20).every(hit => hit.data.mock.calls.length === 0)).toBe(true);
  });
  it("discards unsafe external/protocol-relative/traversal/malformed hits", async () => {
    const urls = ["https://external.example/", "//external.example/", "/../private/", "/%ZZ/", "/guides/safe/"];
    const provider = await create({ init: async () => {}, search: async () => ({ results: urls.map(url => ({ data: async () => ({ url }) })) }) });
    expect((await provider.search("term")).map(result => result.url)).toEqual(["/guides/safe/"]);
  });
  it("does not hide provider initialization failures", async () => {
    await expect(create({ init: async () => { throw new Error("initialization failed"); }, search: async () => ({ results: [] }) })).rejects.toThrow("initialization failed");
  });
});
