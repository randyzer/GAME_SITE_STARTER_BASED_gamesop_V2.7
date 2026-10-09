import {
  normalizeSearchResult,
  type RawSearchResult,
  type SearchProvider,
} from "./search-state";

interface PagefindModule {
  init(): Promise<void>;
  search(query: string): Promise<{
    results: Array<{ data(): Promise<RawSearchResult> }>;
  }>;
}

export async function createPagefindSearchProvider(
  module: PagefindModule,
): Promise<SearchProvider> {
  await module.init();
  return {
    async search(query) {
      const response = await module.search(query);
      const hits = await Promise.all(
        response.results.slice(0, 20).map(hit => hit.data()),
      );
      return hits.flatMap(hit => {
        const result = normalizeSearchResult(hit);
        return result ? [result] : [];
      });
    },
  };
}

export async function loadPagefindSearchProvider(): Promise<SearchProvider> {
  const pagefindPath = "/pagefind/pagefind.js";
  const module = (await import(
    /* @vite-ignore */ pagefindPath
  )) as PagefindModule;
  return createPagefindSearchProvider(module);
}
