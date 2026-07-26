"use client";

import Image from "next/image";

import { useMovieDetails } from "@/app/components/movie-details";
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
 * The click target is a button covering the artwork rather than a wrapper
 * around the card, because the rating stars sit in the same card and a button
 * can't contain a button.
 */
export function PosterCard({
  movie,
  rating,
  priority = false,
}: {
  movie: MovieCard;
  rating: number | null;
  priority?: boolean;
}) {
  const openDetails = useMovieDetails();
  // w500 rather than w342: the card is up to 224px wide, which a 342px source
  // can't cover on a 2x display. Still w500 on phones — the card is smaller
  // there, but the pixel ratio is higher.
  const src = posterUrl(movie.poster_path, "w500");
  if (!src) return null;

  const meta = [
    movie.release_year ?? null,
    movie.vote_average ? `★ ${movie.vote_average.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // 8rem on a phone rather than 10.5: at 10.5 a 390px screen fitted 1.9
    // posters, so a shelf read as one film with a sliver of the next and gave
    // no sense of being a row. 8rem puts 2.5 in view, which is what makes it
    // legible as something to scroll.
    <article className="group w-[8rem] shrink-0 snap-start sm:w-[12.5rem] lg:w-[14rem]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-ink-raised ring-1 ring-ink-line transition-[box-shadow,filter] duration-200">
        <Image
          src={src}
          alt={`${movie.title} poster`}
          fill
          sizes="(max-width: 640px) 8rem, (max-width: 1024px) 12.5rem, 14rem"
          priority={priority}
          className="object-cover group-hover:scale-105 transition-all duration-300"
        />

        <button
          type="button"
          onClick={() => openDetails(movie, rating)}
          className="absolute inset-0 z-10 cursor-pointer rounded-lg outline-offset-2"
        >
          <span className="sr-only">View details for {movie.title}</span>
        </button>
      </div>

      <div className="mt-2 space-y-1 sm:mt-2.5">
        {/* Clamped to two lines and reserving both, so a long title neither
            overflows nor pushes this card's stars below its neighbours'. */}
        <h3 className="line-clamp-1 text-xs leading-snug font-semibold text-bone sm:text-sm">
          {movie.title}
        </h3>
        {meta && <p className="meta mt-0.5 !text-[0.6875rem] sm:!text-xs">{meta}</p>}

        <div className="mt-1.5 sm:mt-2">
          {/* "card" rather than "lg": five 22px stars are 114px, which on a
              128px phone card is the whole width. */}
          <StarRating movieId={movie.id} rating={rating} size="card" />
        </div>
      </div>
    </article>
  );
}
