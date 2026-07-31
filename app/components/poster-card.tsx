"use client";

import Image from "next/image";
import Link from "next/link";

import { ListButtons } from "@/app/components/movie-lists";
import { StarRating } from "@/app/components/star-rating";
import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * A poster in a row: artwork, then its title and your stars, both always
 * visible.
 *
 * Nothing is hidden behind hover. Rating is what this site is for, so the
 * control is present the moment the row renders — a star you have to go
 * looking for is a star nobody sets.
 *
 * The click target is a link covering the artwork rather than a wrapper around
 * the card, because the rating stars sit in the same card and a link can no
 * more contain a button than a button could.
 */

/**
 * How wide the card is, and what `sizes` the browser should believe.
 *
 * `shelf` is the browse-page poster. `compact` is the same card inside Kino's
 * chat panel, which is a fixed-width column rather than the page — at shelf
 * width two posters filled it and the strip stopped reading as a set. The two
 * are one component rather than two so the title clamp, the score line, and the
 * ratable stars can't drift apart the way the hero and film page once did.
 */
const SIZE = {
  // 8rem on a phone rather than 10.5: at 10.5 a 390px screen fitted 1.9
  // posters, so a shelf read as one film with a sliver of the next and gave
  // no sense of being a row. 8rem puts 2.5 in view, which is what makes it
  // legible as something to scroll.
  shelf: {
    width: "w-[8rem] sm:w-[12.5rem] lg:w-[14rem]",
    sizes: "(max-width: 640px) 8rem, (max-width: 1024px) 12.5rem, 14rem",
  },
  compact: {
    width: "w-[7rem] sm:w-[8.5rem]",
    sizes: "(max-width: 640px) 7rem, 8.5rem",
  },
} as const;

export function PosterCard({
  movie,
  rating,
  size = "shelf",
  preload = false,
  readOnly = false,
}: {
  movie: MovieCard;
  rating: number | null;
  size?: keyof typeof SIZE;
  /** Renamed from `priority`, which Next 16 deprecated in favour of `preload`. */
  preload?: boolean;
  readOnly?: boolean;
}) {
  // w500 rather than w342: the card is up to 224px wide, which a 342px source
  // can't cover on a 2x display. Still w500 on phones — the card is smaller
  // there, but the pixel ratio is higher.
  const src = posterUrl(movie.poster_path, "w500");
  if (!src) return null;

  const score = movie.vote_average ? movie.vote_average.toFixed(1) : null;
  const { width, sizes } = SIZE[size];

  return (
    <article className={`group shrink-0 snap-start ${width}`}>
      <div className="skeleton relative aspect-[2/3] overflow-hidden rounded-lg bg-ink-raised ring-1 ring-ink-line transition-[box-shadow,filter] duration-200">
        <Image
          src={src}
          alt={`${movie.title} poster`}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover group-hover:scale-105 transition-all duration-300"
        />

        <Link
          href={`/movie/${movie.id}`}
          className="absolute inset-0 z-10 rounded-lg outline-offset-2"
        >
          <span className="sr-only">View details for {movie.title}</span>
        </Link>

        {/* On top of the link rather than beside it, for the same reason the
            stars sit outside the artwork: a link cannot contain a button. z-20
            clears the tile-wide click target below, and the buttons stop the
            click from reaching it. */}
        <div className="absolute top-1.5 right-1.5 z-20">
          <ListButtons movieId={movie.id} />
        </div>
      </div>

      <div className="mt-2 space-y-1 sm:mt-2.5">
        {/* Clamped to two lines and reserving both, so a long title neither
            overflows nor pushes this card's stars below its neighbours'. */}
        <h3 className="line-clamp-1 text-xs leading-snug font-semibold text-bone sm:text-sm">
          {movie.title}
        </h3>
        {/* Score first and gold, year after it — the same order and colour as
            the hero and film page, so the number you scan for is in the same
            place wherever a film appears. */}
        {(score || movie.release_year) && (
          <p className="meta mt-0.5 flex items-center gap-x-1.5 !text-[0.6875rem] sm:!text-xs">
            {score && (
              // `relative` is load-bearing: the sr-only label below is
              // absolutely positioned, and without a positioned ancestor its
              // containing block is the page rather than the shelf — so it
              // escapes the track's overflow clipping and stretches the
              // document's scroll width by one card offset per poster.
              <span className="relative inline-flex items-center gap-0.5 text-lamp">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1em]">
                  <path
                    d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
                    fill="currentColor"
                  />
                </svg>
                <span className="sr-only">Average rating </span>
                {score}
              </span>
            )}
            {score && movie.release_year && (
              <span aria-hidden="true" className="text-bone-dim/60">
                ·
              </span>
            )}
            {movie.release_year && <span>{movie.release_year}</span>}
          </p>
        )}

        <div className="mt-1.5 sm:mt-2">
          {/* "card" rather than "lg": five 22px stars are 114px, which on a
              128px phone card is the whole width. */}
          <StarRating movieId={movie.id} rating={rating} size="card" readOnly={readOnly} />
        </div>
      </div>
    </article>
  );
}
