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
  // can't cover on a 2x display.
  const src = posterUrl(movie.poster_path, "w500");
  if (!src) return null;

  const meta = [
    movie.release_year ?? null,
    movie.vote_average ? `★ ${movie.vote_average.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="group w-[10.5rem] shrink-0 snap-start sm:w-[12.5rem] lg:w-[14rem]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-ink-raised ring-1 ring-ink-line transition-[box-shadow,filter] duration-200">
        <Image
          src={src}
          alt={`${movie.title} poster`}
          fill
          sizes="(max-width: 640px) 10.5rem, (max-width: 1024px) 12.5rem, 14rem"
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

      <div className="mt-2.5 space-y-1">
        {/* Clamped to two lines and reserving both, so a long title neither
            overflows nor pushes this card's stars below its neighbours'. */}
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-bone">
          {movie.title}
        </h3>
        {meta && <p className="meta mt-0.5 !text-xs">{meta}</p>}

        <div className="mt-2">
          <StarRating movieId={movie.id} rating={rating} size="lg" />
        </div>
      </div>
    </article>
  );
}
