export interface RawSearchResult {
  url: string;
  meta?: Record<string, string | undefined>;
  excerpt?: string;
  plain_excerpt?: string;
}

export interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

export type SearchOutcome =
  | { status: "results"; query: string; results: SearchResult[] }
  | { status: "empty" | "error"; query: string; results: [] };

export async function runSearchProvider(
  provider: SearchProvider,
  rawQuery: string,
): Promise<SearchOutcome> {
  const query = normalizeQuery(rawQuery);
  if (!query) return { status: "empty", query, results: [] };
  try {
    const results = await provider.search(query);
    return results.length
      ? { status: "results", query, results }
      : { status: "empty", query, results: [] };
  } catch {
    return { status: "error", query, results: [] };
  }
}

function normalizeQuery(value: string): string {
  return value.trim().slice(0, 120);
}

export function readSearchQuery(search: string): string {
  return normalizeQuery(new URLSearchParams(search).get("q") ?? "");
}

export function buildSearchLocation(query: string): string {
  const normalized = normalizeQuery(query);
  if (!normalized) return "/search/";

  const parameters = new URLSearchParams({ q: normalized });
  return `/search/?${parameters.toString()}`;
}

function decodeExcerpt(value: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&hellip;": "…",
  };

  return value
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|#39|hellip);/g,
      (entity) => entities[entity] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

function boundExcerpt(value: string): string {
  if (value.length <= 220) return value;
  return `${value.slice(0, 219).trimEnd()}…`;
}

function titleFromUrl(url: string): string {
  const segment = url.split("/").filter(Boolean).at(-1) ?? "Result";
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]?.toLocaleUpperCase("en") + word.slice(1))
    .join(" ");
}

function isSafeLocalUrl(url: string): boolean {
  if (!url.startsWith("/") || url.startsWith("//")) return false;

  try {
    const decodedPath = decodeURIComponent(url.split(/[?#]/, 1)[0]);
    if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
      return false;
    }

    const parsed = new URL(url, "https://local.invalid");
    return parsed.origin === "https://local.invalid";
  } catch {
    return false;
  }
}

export function normalizeSearchResult(
  result: RawSearchResult,
): SearchResult | null {
  if (!isSafeLocalUrl(result.url)) return null;

  const title = result.meta?.title?.trim() || titleFromUrl(result.url);
  const excerpt = boundExcerpt(
    decodeExcerpt(
      result.meta?.description ||
      result.plain_excerpt ||
      result.excerpt ||
      "Open this result to read the full page.",
    ),
  );

  return { url: result.url, title, excerpt };
}
