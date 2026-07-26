import type { RatedMovie } from "@/lib/movies/catalog";

/**
 * What the app can say about someone from their ratings alone.
 *
 * Pure functions over rows that were already fetched — the profile page runs
 * one query and derives everything here, rather than asking Postgres five
 * aggregate questions about six rows.
 */

export type StarBucket = { stars: number; count: number };
export type GenreCount = { genre: string; count: number };

export type TasteStats = {
  count: number;
  /** Mean on the 5-star scale the UI uses, not the stored 1-10. */
  averageStars: number | null;
  /** Runtime of everything rated, in minutes; films with no runtime are skipped. */
  totalMinutes: number;
  /** Always five buckets, including empty ones — the shape of the chart is the point. */
  distribution: StarBucket[];
  topGenres: GenreCount[];
  highest: RatedMovie | null;
  lowest: RatedMovie | null;
};

export function tasteStats(rated: RatedMovie[], topGenreCount = 5): TasteStats {
  const buckets = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ]);
  const genres = new Map<string, number>();

  let total = 0;
  let minutes = 0;

  for (const entry of rated) {
    total += entry.rating;
    minutes += entry.movie.runtime ?? 0;

    // Two adjacent scores per star: 1-2 → 1★, 9-10 → 5★.
    const star = Math.ceil(entry.rating / 2);
    buckets.set(star, (buckets.get(star) ?? 0) + 1);

    for (const genre of entry.movie.genres) {
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }
  }

  const topGenres = [...genres.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, topGenreCount);

  return {
    count: rated.length,
    averageStars: rated.length > 0 ? total / rated.length / 2 : null,
    totalMinutes: minutes,
    distribution: [...buckets.entries()].map(([stars, count]) => ({ stars, count })),
    topGenres,
    // getRatedMovies returns best-first, so the ends of the list are the extremes.
    highest: rated[0] ?? null,
    lowest: rated.length > 1 ? rated[rated.length - 1] : null,
  };
}

/** "18h 20m" — the same shape as a runtime, at a scale where hours matter. */
export function formatWatchTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
