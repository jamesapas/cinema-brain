import { Fragment, type ReactNode } from "react";

import { formatRuntime, type MovieCard } from "@/lib/movies/images";

/**
 * The line under a film's title: score · year · runtime · genre · genre · genre.
 *
 * One component rather than two hand-built rows, because the hero and the film
 * page were drifting: the hero joined a string, the film page laid out spans and
 * then repeated the genres a second time as pills below the synopsis. Genres are
 * metadata like the year is — they belong on the same line, not in a row of
 * chips that made three nouns look like filters you could press.
 *
 * The score leads. It's the one number anyone scans for, and it's why the vote
 * count is gone: "7.9" is the judgement, "(12,481)" is its footnote, and the
 * footnote was as loud as the line's other facts.
 *
 * No hooks, so it renders on the server for the film page and bundles into the
 * client for the hero.
 */
export function MovieMeta({
  movie,
  genreCount = 3,
  className = "",
}: {
  movie: MovieCard;
  /** Genres beyond the third stop being descriptive and start being a list. */
  genreCount?: number;
  className?: string;
}) {
  const runtime = formatRuntime(movie.runtime);
  const items: { key: string; node: ReactNode }[] = [];

  if (movie.vote_average !== null) {
    items.push({
      key: "score",
      node: (
        // Gold, and the only coloured thing in the line — the star alone is
        // ambiguous next to a rating control made of the same glyph, so the
        // reading is spelled out for screen readers.
        <span className="inline-flex items-center gap-1 text-lamp">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1em]">
            <path
              d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
              fill="currentColor"
            />
          </svg>
          <span className="sr-only">Average rating </span>
          {movie.vote_average.toFixed(1)}
        </span>
      ),
    });
  }

  if (movie.release_year) {
    items.push({ key: "year", node: <span>{movie.release_year}</span> });
  }

  if (runtime) {
    items.push({ key: "runtime", node: <span>{runtime}</span> });
  }

  for (const genre of movie.genres.slice(0, genreCount)) {
    items.push({ key: `genre-${genre}`, node: <span>{genre}</span> });
  }

  if (items.length === 0) return null;

  return (
    // Wrapping, because six items at a phone's width is two lines; the dots are
    // dimmer than what they separate and hidden from assistive tech, where they
    // would otherwise be read aloud as "middle dot" between every fact.
    <p className={`meta flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && (
            <span aria-hidden="true" className="text-bone-dim/60">
              ·
            </span>
          )}
          {item.node}
        </Fragment>
      ))}
    </p>
  );
}
