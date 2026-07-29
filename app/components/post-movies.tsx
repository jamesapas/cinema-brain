import Image from "next/image";
import Link from "next/link";

import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * The films a post is about, under its text.
 *
 * Rendered consistently whether there is 1 film or multiple films.
 * Posters have a uniform 2:3 aspect ratio, subtle hover state, title, and release year.
 */
export function PostMovies({ movies }: { movies: MovieCard[] }) {
  if (movies.length === 0) return null;

  const isSingle = movies.length === 1;

  return (
    <ul className="no-scrollbar mt-3.5 flex flex-wrap sm:flex-nowrap gap-3.5 overflow-x-auto py-0.5">
      {movies.map((movie) => (
        <li
          key={movie.id}
          className={isSingle ? "w-28 sm:w-32 shrink-0" : "w-24 sm:w-28 shrink-0"}
        >
          <Link href={`/movie/${movie.id}`} className="group block">
            <Poster movie={movie} sizes={isSingle ? "8rem" : "7rem"} />
            <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-bone">
              {movie.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {movie.release_year && (
                <span className="meta !text-[0.6875rem] text-bone-dim">{movie.release_year}</span>
              )}
              {isSingle && movie.genres?.length > 0 && (
                <>
                  <span className="text-[0.6rem] text-bone-dim/40">•</span>
                  <span className="meta truncate !text-[0.6875rem] text-bone-dim/80">
                    {movie.genres[0]}
                  </span>
                </>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Poster({ movie, sizes }: { movie: MovieCard; sizes: string }) {
  const src = posterUrl(movie.poster_path, "w342");

  return (
    <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-ink ring-1 ring-ink-line shadow-sm transition-all duration-200 group-hover:ring-bone/30 group-hover:shadow-md">
      {src && (
        <Image
          src={src}
          alt={movie.title}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
    </span>
  );
}

