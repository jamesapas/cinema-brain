"use client";

import Image from "next/image";

import { useMovieDetails } from "@/app/components/movie-details";
import { StarRating } from "@/app/components/star-rating";
import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * A poster in a row. At rest it's just the artwork; hovering or focusing lifts
 * it and reveals the title and the rating control.
 *
 * The click target is a button covering the artwork rather than a wrapper
 * around it, because the rating stars sit inside the same card and a button
 * can't contain a button. The stars stack above it and take their own clicks.
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
  const src = posterUrl(movie.poster_path, "w342");
  if (!src) return null;

  return (
    <article className="group relative w-[9.5rem] shrink-0 snap-start rounded-lg transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.04] focus-within:z-10 focus-within:scale-[1.04] sm:w-[11rem]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-ink-raised ring-1 ring-ink-line">
        <Image
          src={src}
          alt={`${movie.title} poster`}
          fill
          sizes="(max-width: 640px) 9.5rem, 11rem"
          priority={priority}
          className="object-cover"
        />

        <button
          type="button"
          onClick={() => openDetails(movie, rating)}
          className="absolute inset-0 z-10 cursor-pointer rounded-lg outline-offset-2"
        >
          <span className="sr-only">View details for {movie.title}</span>
        </button>

        {/* Overlay only on hover/focus, so a row at rest stays pure artwork. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-ink via-ink/70 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <p className="text-[0.8125rem] leading-tight font-semibold text-bone">
            {movie.title}
          </p>
          <p className="meta mt-0.5 !text-[0.6875rem]">
            {movie.release_year ?? "—"}
            {movie.vote_average ? ` · ★ ${movie.vote_average.toFixed(1)}` : ""}
          </p>
          <div className="pointer-events-auto mt-1.5">
            <StarRating movieId={movie.id} rating={rating} />
          </div>
        </div>
      </div>

      {/* A rated film keeps a marker when the overlay is hidden, so you can see
          what you've already scored while scanning a row. */}
      {rating !== null && (
        <p className="meta mt-1.5 !text-xs !text-lamp group-hover:opacity-0">
          ★ {rating / 2}
        </p>
      )}
    </article>
  );
}
