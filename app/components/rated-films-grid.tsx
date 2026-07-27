"use client";

import { Icon } from "@iconify/react";
import { useMemo, useState } from "react";

import { PosterCard } from "@/app/components/poster-card";
import type { RatedMovie } from "@/lib/movies/catalog";

type Sort = "rating-desc" | "rating-asc" | "year-desc" | "year-asc" | "title-asc";

const SORTS: { value: Sort; label: string }[] = [
  { value: "rating-desc", label: "Highest rated" },
  { value: "rating-asc", label: "Lowest rated" },
  { value: "year-desc", label: "Newest release" },
  { value: "year-asc", label: "Oldest release" },
  { value: "title-asc", label: "Title A–Z" },
];

/** How many genre chips to offer before it turns into a wall of buttons. */
const MAX_GENRE_CHIPS = 8;

function sortRated(rated: RatedMovie[], sort: Sort): RatedMovie[] {
  const sorted = [...rated];
  switch (sort) {
    case "rating-desc":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "rating-asc":
      return sorted.sort((a, b) => a.rating - b.rating);
    case "year-desc":
      return sorted.sort((a, b) => (b.movie.release_year ?? 0) - (a.movie.release_year ?? 0));
    case "year-asc":
      return sorted.sort((a, b) => (a.movie.release_year ?? 0) - (b.movie.release_year ?? 0));
    case "title-asc":
      return sorted.sort((a, b) => a.movie.title.localeCompare(b.movie.title));
  }
}

/**
 * The rated-films shelf, with sorting and a genre filter.
 *
 * Client-side: the whole dataset is already on the page (a profile's rated
 * films, not the catalog), so slicing and reordering it locally is instant
 * and needs no round trip.
 */
export function RatedFilmsGrid({
  rated,
  heading,
}: {
  rated: RatedMovie[];
  heading: string;
}) {
  const [sort, setSort] = useState<Sort>("rating-desc");
  const [genre, setGenre] = useState<string | null>(null);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of rated) {
      for (const g of entry.movie.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_GENRE_CHIPS)
      .map(([name]) => name);
  }, [rated]);

  const filtered = useMemo(
    () => (genre ? rated.filter((entry) => entry.movie.genres.includes(genre)) : rated),
    [rated, genre],
  );

  const shown = useMemo(() => sortRated(filtered, sort), [filtered, sort]);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold text-bone">{heading}</h2>

        <label className="flex items-center gap-2">
          <span className="meta">Sort</span>
          <div className="relative">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
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

      {genres.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <GenreChip label="All" active={genre === null} onClick={() => setGenre(null)} />
          {genres.map((entry) => (
            <GenreChip
              key={entry}
              label={entry}
              active={genre === entry}
              onClick={() => setGenre(genre === entry ? null : entry)}
            />
          ))}
        </div>
      )}

      <p className="meta mt-4">
        {shown.length} film{shown.length === 1 ? "" : "s"}
        {genre ? ` in ${genre}` : ""}
      </p>

      {shown.length === 0 ? (
        <p className="mt-6 text-bone-soft">No films match that filter.</p>
      ) : (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] [&>article]:w-full">
          {shown.map((entry) => (
            <PosterCard key={entry.movie.id} movie={entry.movie} rating={entry.rating} />
          ))}
        </div>
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
