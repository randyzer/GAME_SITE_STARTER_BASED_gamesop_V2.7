import {
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { loadPagefindSearchProvider } from "../../core/pagefind-search-adapter";
import {
  buildSearchLocation,
  readSearchQuery,
  runSearchProvider,
  type SearchOutcome,
  type SearchProvider,
} from "../../core/search-state";

type SearchUiState = SearchOutcome | {
  status: "idle" | "loading";
  query: string;
  results: [];
};

export default function SearchIsland() {
  const providerRef = useRef<Promise<SearchProvider> | null>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchUiState>({ status: "idle", query: "", results: [] });

  async function runSearch(value: string) {
    const normalized = readSearchQuery(`?${new URLSearchParams({ q: value }).toString()}`);
    const requestId = ++requestRef.current;
    if (!normalized) {
      setState({ status: "idle", query: "", results: [] });
      return;
    }
    setState({ status: "loading", query: normalized, results: [] });
    try {
      providerRef.current ??= loadPagefindSearchProvider();
      const provider = await providerRef.current;
      const outcome = await runSearchProvider(provider, normalized);
      if (requestId === requestRef.current) setState(outcome);
    } catch {
      providerRef.current = null;
      if (requestId === requestRef.current) setState({ status: "error", query: normalized, results: [] });
    }
  }

  useEffect(() => {
    const initialQuery = readSearchQuery(window.location.search);
    setQuery(initialQuery);
    void runSearch(initialQuery);
    return () => { requestRef.current += 1; };
  }, []);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    window.history.replaceState(null, "", buildSearchLocation(query));
    void runSearch(query);
  }

  const statusMessage =
    state.status === "loading"
      ? "Searching the local index…"
      : state.status === "error"
        ? "The local search index is unavailable. Try refreshing this page."
        : state.status === "results"
          ? `${state.results.length} result${state.results.length === 1 ? "" : "s"} for “${state.query}”.`
          : state.status === "empty"
            ? `No matching results for “${state.query}”. Try a shorter or broader term.`
            : "Enter a guide title, game term, or question.";

  return (
    <section className="search-console" aria-labelledby="search-console-title" data-search-state={state.status}>
      <div className="search-console__status">
        <span className="signal-dot" aria-hidden="true" />
        <div>
          <p id="search-console-title">Local site search</p>
          <small>Queries stay in this browser and run against the static build.</small>
        </div>
      </div>

      <form action="/search/" role="search" onSubmit={handleSubmit}>
        <label htmlFor="query">Search published dispatches</label>
        <div>
          <input
            id="query"
            name="q"
            type="search"
            maxLength={120}
            placeholder="Try a guide title or topic"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <button type="submit">Search</button>
        </div>
      </form>

      <p className="search-console__note" aria-live="polite">
        {statusMessage}
      </p>

      {state.status === "empty" && (
        <div className="search-empty">
          <span aria-hidden="true">00</span>
          <p>No matching dispatches. Try a shorter or broader term.</p>
        </div>
      )}

      {state.status === "results" && (
        <ol className="search-results">
          {state.results.map((result, index) => (
            <li key={result.url}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <a href={result.url}>
                <strong>{result.title}</strong>
                <p>{result.excerpt}</p>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
