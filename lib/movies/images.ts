/**
 * Pure presentation types and helpers, safe to import from client components.
 *
 * Kept apart from `catalog.ts` on purpose: that module reaches Pinecone and
 * OpenAI through the search layer, so importing a helper from it in a client
 * component would try to pull the whole server data layer into the browser
 * bundle. Nothing here may import anything server-only.
 */

export type MovieCard = {
  id: number;
  title: string;
  tagline: string | null;
  release_year: number | null;
  genres: string[];
  runtime: number | null;
  vote_average: number | null;
  vote_count: number | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path: string | null, size: "w342" | "w500" = "w500") {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size: "w1280" | "original" = "w1280") {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

/** "1h 58m" reads faster than "118 min" when it sits in a row of metadata. */
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The metadata line under a title: year · runtime · genres, minus the gaps. */
export function metaLine(movie: MovieCard, genreCount = 3): string {
  return [
    movie.release_year,
    formatRuntime(movie.runtime),
    movie.genres.slice(0, genreCount).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
