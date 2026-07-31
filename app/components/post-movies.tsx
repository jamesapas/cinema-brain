import Image from "next/image";
import Link from "next/link";

import { ListButtons } from "@/app/components/movie-lists";
import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * The films a post is about, under its text.
 *
 * Rendered consistently whether there is 1 film or multiple films.
 * Posters have a uniform 2:3 aspect ratio, subtle hover state, title, release year,
 * primary genre, and watchlist/favorite quick-action buttons.
 */
export function PostMovies({ movies }: { movies: MovieCard[] }) {
  if (movies.length === 0) return null;

  return (
    <ul className="no-scrollbar mt-3.5 flex flex-nowrap gap-3.5 overflow-x-auto py-0.5">
      {movies.map((movie) => (
        <li key={movie.id} className="w-24 sm:w-28 shrink-0">
          <div className="group block">
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-ink ring-1 ring-ink-line shadow-sm transition-all duration-200 group-hover:ring-bone/30 group-hover:shadow-md">
              <Poster movie={movie} sizes="7rem" />
              <Link
                href={`/movie/${movie.id}`}
                className="absolute inset-0 z-10 rounded-lg"
              >
                <span className="sr-only">View details for {movie.title}</span>
              </Link>
              <div className="absolute top-1.5 right-1.5 z-20">
                <ListButtons movieId={movie.id} lists={["watchlist"]} />
              </div>
            </div>

            <Link href={`/movie/${movie.id}`} className="block">
              <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-bone group-hover:text-bone/80 transition-colors">
                {movie.title}
              </p>
              <div className="flex items-center gap-1 mt-0.5 min-w-0">
                {movie.release_year && (
                  <span className="meta shrink-0 !text-[0.6875rem] text-bone-dim">{movie.release_year}</span>
                )}
                {movie.genres?.length > 0 && (
                  <>
                    <span className="text-[0.6rem] text-bone-dim/40 shrink-0">•</span>
                    <span className="meta truncate !text-[0.6875rem] text-bone-dim/80">
                      {movie.genres[0]}
                    </span>
                  </>
                )}
              </div>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Poster({ movie, sizes }: { movie: MovieCard; sizes: string }) {
  const src = posterUrl(movie.poster_path, "w342");

  if (!src) return null;

  return (
    <Image
      src={src}
      alt={movie.title}
      fill
      sizes={sizes}
      className="object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

