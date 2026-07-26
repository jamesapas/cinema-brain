"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { AskAboutButton } from "@/app/components/chat-overlay";
import { StarRating } from "@/app/components/star-rating";
import {
  backdropUrl,
  formatRuntime,
  posterUrl,
  type MovieCard,
} from "@/lib/movies/images";

/**
 * Full details for one film, as a dialog over the catalog.
 *
 * A dialog rather than a route: browsing is a scroll position, and sending
 * someone to /movie/123 and back loses it. Everything shown here already
 * travelled with the card, so opening one costs no request.
 */

type OpenDetails = (movie: MovieCard, rating: number | null) => void;

const MovieDetailsContext = createContext<OpenDetails | null>(null);

export function useMovieDetails() {
  const open = useContext(MovieDetailsContext);
  if (!open) {
    throw new Error("useMovieDetails must be used inside MovieDetailsProvider.");
  }
  return open;
}

/** The same dialog, opened from a surface that isn't a poster — the hero. */
export function MoreInfoButton({
  movie,
  rating,
}: {
  movie: MovieCard;
  rating: number | null;
}) {
  const open = useMovieDetails();

  return (
    <button type="button" onClick={() => open(movie, rating)} className="btn btn-quiet">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.25" />
        <path d="M12 11v5.5M12 7.6v.1" />
      </svg>
      More info
    </button>
  );
}

type Showing = { movie: MovieCard; rating: number | null };

export function MovieDetailsProvider({ children }: { children: React.ReactNode }) {
  const [showing, setShowing] = useState<Showing | null>(null);

  const open = useCallback<OpenDetails>((movie, rating) => {
    setShowing({ movie, rating });
  }, []);

  return (
    <MovieDetailsContext.Provider value={open}>
      {children}
      {showing && (
        <MovieDetailsDialog
          movie={showing.movie}
          rating={showing.rating}
          onClose={() => setShowing(null)}
        />
      )}
    </MovieDetailsContext.Provider>
  );
}

function MovieDetailsDialog({
  movie,
  rating,
  onClose,
}: {
  movie: MovieCard;
  rating: number | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Send focus into the dialog, and hand it back to whatever opened it —
    // otherwise a keyboard user lands at the top of the page on close.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    // The page behind must not scroll while the dialog owns the viewport.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const backdrop = backdropUrl(movie.backdrop_path);
  const poster = posterUrl(movie.poster_path, "w342");
  const runtime = formatRuntime(movie.runtime);
  const votes =
    movie.vote_count && movie.vote_count > 0
      ? new Intl.NumberFormat("en-US").format(movie.vote_count)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="scrim-in fixed inset-0 bg-ink/85 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-details-title"
        className="sheet-in relative my-auto w-full max-w-3xl overflow-hidden rounded-xl bg-ink-raised shadow-2xl ring-1 ring-ink-line"
      >
        <header className="relative">
          {backdrop ? (
            <div className="relative aspect-[16/9] w-full sm:aspect-[2.4/1]">
              <Image
                src={backdrop}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 48rem"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-raised via-ink-raised/55 to-transparent" />
            </div>
          ) : (
            <div className="h-24 w-full bg-ink" />
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-ink/70 text-bone backdrop-blur transition-colors hover:bg-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m5 5 14 14M19 5 5 19" />
            </svg>
          </button>
        </header>

        <div className="relative -mt-14 flex gap-5 px-5 pb-6 sm:-mt-20 sm:px-8 sm:pb-8">
          {poster && (
            // self-start matters: the row is a flex container, so without it the
            // poster stretches to the full column height and the 2:3 is lost.
            <div className="relative hidden aspect-[2/3] w-32 shrink-0 self-start overflow-hidden rounded-lg ring-1 ring-ink-line sm:block">
              <Image src={poster} alt="" fill sizes="8rem" className="object-cover" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2
              id="movie-details-title"
              className="text-2xl leading-tight font-bold text-bone sm:text-3xl"
            >
              {movie.title}
            </h2>

            <p className="meta mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {movie.release_year && <span>{movie.release_year}</span>}
              {runtime && <span>{runtime}</span>}
              {movie.vote_average !== null && (
                <span className="inline-flex items-center gap-1 text-lamp">
                  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
                      fill="currentColor"
                    />
                  </svg>
                  {movie.vote_average.toFixed(1)}
                  {votes && <span className="text-bone-dim">({votes})</span>}
                </span>
              )}
            </p>

            {movie.tagline && (
              <p className="mt-4 text-[0.95rem] leading-snug text-lamp/90 italic">
                {movie.tagline}
              </p>
            )}

            {movie.overview && (
              <p className="mt-4 leading-relaxed text-bone-soft">{movie.overview}</p>
            )}

            {movie.genres.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {movie.genres.map((genre) => (
                  <li
                    key={genre}
                    className="rounded-full border border-ink-line px-3 py-1 text-xs font-medium text-bone-soft"
                  >
                    {genre}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-7 flex flex-wrap items-end gap-6 border-t border-ink-line pt-6">
              <div className="flex flex-col gap-2">
                <span className="label">Your rating</span>
                <StarRating movieId={movie.id} rating={rating} size="lg" />
              </div>
              <AskAboutButton title={movie.title} onOpened={onClose} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
