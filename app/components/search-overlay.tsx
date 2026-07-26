"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";
import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * Search as an overlay over whatever you were looking at.
 *
 * Finding a film is a detour, not a destination — you want to check whether
 * the catalog has something and get back to what you were doing. So this
 * floats above the page rather than navigating away from it, and closing it
 * leaves you exactly where you were — choosing a result, of course, does take
 * you to that film's page, which is the one thing you came here to do. The
 * list pages in as you scroll rather
 * than handing off to `/search`, so a long result set never costs you the
 * page you were on. `/search` still exists as a linkable result set, but
 * nothing here points at it.
 */

const SearchOverlayContext = createContext<(() => void) | null>(null);

export function useSearchOverlay() {
  const open = useContext(SearchOverlayContext);
  if (!open) throw new Error("useSearchOverlay must be used inside SearchOverlayProvider.");
  return open;
}

export function SearchOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The shortcut people already try. Meta for macOS, Control elsewhere.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SearchOverlayContext.Provider value={open}>
      {children}
      {isOpen && <SearchOverlay onClose={() => setIsOpen(false)} />}
    </SearchOverlayContext.Provider>
  );
}

type SearchResponse = { movies?: MovieCard[]; hasMore?: boolean; error?: string };

/* Chrome lives in globals.css as `.overlay-card`, shared with Kino's panel. */

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<MovieCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // A ref, not the loadingMore state: the observer can fire twice before a
  // state update has re-rendered, which would fetch the same page twice.
  const loadingMoreRef = useRef(false);

  // What the box says *now*, readable from inside an in-flight request that
  // was started for an older term. Synced in an effect rather than assigned
  // during render, which React forbids.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  /**
   * Clearing back below the minimum is handled here rather than in the fetch
   * effect: it's a direct consequence of the keystroke, and setting state
   * synchronously inside an effect just to undo it causes a cascading render.
   */
  function updateQuery(next: string) {
    setQuery(next);
    if (next.trim().length < MIN_SEARCH_LENGTH) {
      setMovies([]);
      setHasMore(false);
      setError(null);
      setLoading(false);
    }
  }

  // Debounced fetch. The AbortController matters more than the debounce: without
  // it a slow response for "ma" can land after "matrix" and repaint stale rows.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_SEARCH_LENGTH) return;

    const controller = new AbortController();

    const id = setTimeout(async () => {
      // Inside the timeout, not before it: nothing is loading during the
      // debounce window, so saying so would flicker on every keystroke.
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as SearchResponse;

        if (!response.ok) throw new Error(payload.error ?? "Search failed.");

        setMovies(payload.movies ?? []);
        setHasMore(Boolean(payload.hasMore));
        setActive(0);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
        setMovies([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  /**
   * The next page, appended. Offset is the number of rows already held rather
   * than a page counter, so it stays correct no matter how the list was filled.
   */
  const loadMore = useCallback(async () => {
    const term = queryRef.current.trim();
    if (loadingMoreRef.current || term.length < MIN_SEARCH_LENGTH) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(term)}&offset=${movies.length}`,
      );
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) throw new Error(payload.error ?? "Search failed.");

      // The term may have moved on while this was in flight. Appending now
      // would splice results for the old query onto the new list.
      if (queryRef.current.trim() !== term) return;

      setMovies((current) => [...current, ...(payload.movies ?? [])]);
      setHasMore(Boolean(payload.hasMore));
    } catch (cause) {
      // Surfaced under the list, not in place of it — the rows already on
      // screen are still good, and replacing them would be a worse answer.
      setError(cause instanceof Error ? cause.message : "Search failed.");
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [movies.length]);

  // Fetch the next page as the end of the list comes into view. rootMargin
  // starts it before the sentinel is actually visible, so a fast scroll meets
  // rows rather than a spinner.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Keep the keyboard-selected row in view as it moves past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll("li")
      [active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /**
   * The keyboard path. The rows themselves are real links — middle-click and
   * "open in new tab" should work on a list of films — so this exists only for
   * Enter, which has no link to activate.
   */
  function show(movie: MovieCard) {
    onClose();
    router.push(`/movie/${movie.id}`);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (movies.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % movies.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + movies.length) % movies.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      show(movies[active]);
    }
  }

  const term = query.trim();
  const searched = term.length >= MIN_SEARCH_LENGTH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="scrim-in fixed inset-0 bg-ink/70 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search films"
        onKeyDown={onKeyDown}
        // No chrome of its own — it only stacks the two cards and spaces them.
        // max-h-full caps the pair once a long result set has filled the screen.
        className="palette-in relative flex max-h-full w-full max-w-[460px] flex-col gap-2"
      >
        {/* The bar owns its height so the input's h-full has something to fill. */}
        <div className="overlay-card relative h-14 shrink-0">
          <Icon
            icon="iconamoon:search"
            width={20}
            height={20}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-bone-dim"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Search by title…"
            aria-label="Search films by title"
            autoComplete="off"
            className="h-full w-full bg-transparent pl-12 pr-10 text-base text-gray-100 tracking-wide placeholder:text-gray-400 outline-none"
          />
          <kbd className="meta absolute top-1/2 right-4 -translate-y-1/2 rounded border border-ink-line px-1.5 py-0.5 !text-[0.6875rem]">
            esc
          </kbd>
        </div>

        {/* Its own card, mounted only once there is something to report, so an
            idle overlay is the bar alone rather than the bar plus an empty box. */}
        {searched && (
          <div className="overlay-card flex max-h-[50vh] min-h-0 flex-col">
            <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              {error && movies.length === 0 ? (
                <p role="alert" className="px-4 py-6 text-sm text-lamp">
                  {error}
                </p>
              ) : movies.length === 0 ? (
                <p className="meta px-4 py-6">
                  {loading ? "Searching…" : `No title matches “${term}”.`}
                </p>
              ) : (
                <ul ref={listRef} className="result-in py-2">
                  {movies.map((movie, index) => (
                    <li key={movie.id}>
                      <Link
                        href={`/movie/${movie.id}`}
                        onClick={onClose}
                        onMouseEnter={() => setActive(index)}
                        className={`flex w-full items-center gap-3.5 px-3 py-2.5 text-left transition-colors ${
                          index === active ? "bg-bone/10" : ""
                        }`}
                      >
                        <Poster movie={movie} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-bone">
                            {movie.title}
                          </span>
                          <span className="meta mt-0.5 block !text-sm">
                            {[
                              movie.release_year,
                              movie.vote_average ? `★ ${movie.vote_average.toFixed(1)}` : null,
                              movie.genres.slice(0, 2).join(", ") || null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {/* Tripwire for the next page. Only rendered while one exists,
                  so reaching the true end of the list stops the observer. */}
              {hasMore && (
                <div ref={sentinelRef} className="meta px-4 py-3">
                  {loadingMore ? "Loading more…" : ""}
                </div>
              )}

              {error && movies.length > 0 && (
                <p role="alert" className="meta px-4 py-3 !text-lamp">
                  {error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Poster({ movie }: { movie: MovieCard }) {
  const src = posterUrl(movie.poster_path, "w342");

  return (
    // 48×72 is the poster's native 2:3, which the old 40×56 was not.
    <span className="relative block h-18 w-12 shrink-0 overflow-hidden rounded bg-ink ring-1 ring-ink-line">
      {src && <Image src={src} alt="" fill sizes="3rem" className="object-cover" />}
    </span>
  );
}
