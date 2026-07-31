"use client";

import { Icon } from "@iconify/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRatedMoviesAction } from "@/app/actions/rated-films";
import { PosterCard } from "@/app/components/poster-card";
import type { RatedMovie, RatedMoviesSort } from "@/lib/movies/catalog";

type Sort = RatedMoviesSort;

const SORTS: { value: Sort; label: string }[] = [
  { value: "rating-desc", label: "Highest rated" },
  { value: "rating-asc", label: "Lowest rated" },
  { value: "year-desc", label: "Newest release" },
  { value: "year-asc", label: "Oldest release" },
  { value: "title-asc", label: "Title A–Z" },
];

const PAGE_SIZE = 24;

export function RatedFilmsGrid({
  userId,
  heading,
  readOnly = false,
  totalCount,
  availableGenres = [],
}: {
  userId: string;
  heading: string;
  readOnly?: boolean;
  totalCount: number;
  availableGenres?: string[];
}) {
  const [sort, setSort] = useState<Sort>("rating-desc");
  const [genre, setGenre] = useState<string | null>(null);

  const [movies, setMovies] = useState<RatedMovie[]>([]);
  const [total, setTotal] = useState<number>(totalCount);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasEnteredView, setHasEnteredView] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Observer to trigger initial fetch when grid enters viewport
  useEffect(() => {
    if (hasEnteredView) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasEnteredView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasEnteredView]);

  // Trigger load when grid comes into view or filter/sort changes
  useEffect(() => {
    if (!hasEnteredView) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const res = await fetchRatedMoviesAction({
        userId,
        limit: PAGE_SIZE,
        offset: 0,
        sort,
        genre,
      });

      if (!cancelled) {
        if (res.ok) {
          setMovies(res.movies);
          setTotal(res.total);
          setHasMore(res.hasMore);
        }
        setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [hasEnteredView, sort, genre, userId]);

  // Load next page function
  const loadNextPage = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    const res = await fetchRatedMoviesAction({
      userId,
      limit: PAGE_SIZE,
      offset: movies.length,
      sort,
      genre,
    });

    if (res.ok) {
      setMovies((prev) => [...prev, ...res.movies]);
      setTotal(res.total);
      setHasMore(res.hasMore);
    }
    setIsLoadingMore(false);
  }, [userId, movies.length, sort, genre, isLoading, isLoadingMore, hasMore]);

  // Infinite scroll observer for bottom sentinel
  useEffect(() => {
    if (!hasEnteredView || isLoading || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasEnteredView, isLoading, hasMore, loadNextPage]);

  const handleSortChange = (newSort: Sort) => {
    setSort(newSort);
  };

  const handleGenreChange = (newGenre: string | null) => {
    setGenre(newGenre === genre ? null : newGenre);
  };

  return (
    <section ref={containerRef} className="min-h-[200px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold text-bone">{heading}</h2>

        <label className="flex items-center gap-2">
          <span className="meta">Sort</span>
          <div className="relative">
            <select
              value={sort}
              onChange={(event) => handleSortChange(event.target.value as Sort)}
              className="appearance-none rounded-full border border-ink-line bg-transparent py-1.5 pr-8 pl-3 text-sm font-semibold text-bone transition-colors hover:border-bone/40 focus-visible:border-lamp"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value} className="bg-ink text-bone">
                  {option.label}
                </option>
              ))}
            </select>
            <Icon
              icon="lucide:chevron-down"
              className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-bone-soft"
            />
          </div>
        </label>
      </div>

      {availableGenres.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <GenreChip label="All" active={genre === null} onClick={() => handleGenreChange(null)} />
          {availableGenres.map((g) => (
            <GenreChip
              key={g}
              label={g}
              active={genre === g}
              onClick={() => handleGenreChange(g)}
            />
          ))}
        </div>
      )}

      <p className="meta mt-4">
        {total} film{total === 1 ? "" : "s"}
        {genre ? ` in ${genre}` : ""}
      </p>

      {/* Grid view */}
      {isLoading ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="skeleton aspect-[2/3] w-full rounded-xl" />
              <div className="skeleton h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : movies.length === 0 ? (
        <p className="mt-6 text-bone-soft">
          {hasEnteredView ? "No films match that filter." : "Loading films..."}
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] [&>article]:w-full">
            {movies.map((entry) => (
              <PosterCard
                key={entry.movie.id}
                movie={entry.movie}
                rating={entry.rating}
                readOnly={readOnly}
              />
            ))}
            {isLoadingMore &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`more-${i}`} className="flex flex-col gap-2">
                  <div className="skeleton aspect-[2/3] w-full rounded-xl" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                </div>
              ))}
          </div>

          <div ref={sentinelRef} className="h-10 w-full" aria-hidden="true" />
        </>
      )}
    </section>
  );
}

function GenreChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "border-lamp bg-lamp/15 text-lamp"
          : "border-ink-line text-bone-soft hover:border-bone/40 hover:text-bone"
      }`}
    >
      {label}
    </button>
  );
}
