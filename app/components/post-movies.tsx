import Image from "next/image";
import Link from "next/link";

import { MovieMeta } from "@/app/components/movie-meta";
import { posterUrl, type MovieCard } from "@/lib/movies/images";

/**
 * The films a post is about, under its text.
 *
 * Not `PosterCard`. That card is the catalog's unit — it carries rating stars
 * and the watchlist buttons, and four of them inside a post would put eight
 * controls under a paragraph nobody has finished reading. Here the artwork is a
 * citation: it says which film is being talked about and takes you to it.
 *
 * Two layouts, because one film and several are different things to look at. A
 * lone film gets a wide card with its metadata line, the way it would appear
 * anywhere else it is the subject. Two or more become a row of posters, where
 * the comparison is the point and the metadata would be four competing lines.
 */
export function PostMovies({ movies }: { movies: MovieCard[] }) {
  if (movies.length === 0) return null;

  if (movies.length === 1) return <SingleFilm movie={movies[0]} />;

  return (
    // Scrolls rather than wraps: four posters fit a desktop card and two fit a
    // phone, and a wrapped second row of one poster reads as a mistake.
    <ul className="no-scrollbar mt-3 flex gap-3 overflow-x-auto">
      {movies.map((movie) => (
        <li key={movie.id} className="w-[5.5rem] shrink-0 sm:w-[6.5rem]">
          <Link href={`/movie/${movie.id}`} className="group block">
            <Poster movie={movie} sizes="(max-width: 640px) 5.5rem, 6.5rem" />
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-semibold text-bone">
              {movie.title}
            </p>
            {movie.release_year && <p className="meta !text-[0.6875rem]">{movie.release_year}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SingleFilm({ movie }: { movie: MovieCard }) {
  return (
    <Link
      href={`/movie/${movie.id}`}
      className="group mt-3 flex max-w-md items-center gap-3.5 rounded-lg border border-ink-line bg-ink-raised p-2.5 transition-colors hover:border-bone/25"
    >
      <div className="w-14 shrink-0">
        <Poster movie={movie} sizes="3.5rem" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-bone">{movie.title}</p>
        {/* The same line the film page and the hero carry, so a film reads the
            same wherever it turns up. */}
        <MovieMeta movie={movie} genreCount={2} className="mt-1 !text-xs" />
      </div>
    </Link>
  );
}

function Poster({ movie, sizes }: { movie: MovieCard; sizes: string }) {
  const src = posterUrl(movie.poster_path, "w342");

  return (
    <span className="relative block aspect-[2/3] overflow-hidden rounded bg-ink ring-1 ring-ink-line">
      {src && (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
    </span>
  );
}
