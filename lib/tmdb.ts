/**
 * Minimal TMDB v3 client.
 *
 * Auth uses the v4 read access token as a bearer header (TMDB's current
 * recommendation) rather than the legacy `api_key` query param.
 */

import { serverEnv } from "@/lib/env";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAX_ATTEMPTS = 5;

export type TmdbGenre = { id: number; name: string };

export type TmdbDiscoverMovie = {
  id: number;
  title: string;
  original_title: string;
  original_language: string;
  overview: string | null;
  release_date: string | null;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  adult: boolean;
};

export type TmdbDiscoverResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbDiscoverMovie[];
};

export type TmdbMovieDetails = Omit<TmdbDiscoverMovie, "genre_ids"> & {
  genres: TmdbGenre[];
  runtime: number | null;
  tagline: string | null;
  status: string | null;
  imdb_id: string | null;
};

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }

  /** 404s are expected for withdrawn titles — callers skip rather than abort. */
  get isNotFound() {
    return this.status === 404;
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tmdbFetch<T>(path: string, params: QueryParams = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${serverEnv.tmdbAccessToken}`,
          Accept: "application/json",
        },
      });
    } catch (error) {
      // Network-level failure: retry with backoff.
      lastError = error;
      await sleep(2 ** attempt * 250);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    // Rate limited: TMDB tells us how long to wait.
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 1);
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 1) * 1000 + 250);
      lastError = new TmdbError("TMDB rate limit exceeded", 429);
      continue;
    }

    // 4xx other than 429 won't fix itself.
    if (response.status < 500) {
      throw new TmdbError(
        `TMDB ${response.status} for ${path}: ${await response.text()}`,
        response.status,
      );
    }

    lastError = new TmdbError(`TMDB ${response.status} for ${path}`, response.status);
    await sleep(2 ** attempt * 250);
  }

  throw lastError instanceof Error
    ? lastError
    : new TmdbError(`TMDB request failed for ${path}`, 500);
}

export type DiscoverOptions = {
  page?: number;
  sortBy?: string;
  minVoteCount?: number;
  releasedBefore?: string;
  language?: string;
};

export function discoverMovies({
  page = 1,
  sortBy = "popularity.desc",
  minVoteCount = 100,
  releasedBefore,
  language = "en-US",
}: DiscoverOptions = {}): Promise<TmdbDiscoverResponse> {
  return tmdbFetch<TmdbDiscoverResponse>("/discover/movie", {
    page,
    sort_by: sortBy,
    "vote_count.gte": minVoteCount,
    "primary_release_date.lte": releasedBefore,
    include_adult: false,
    include_video: false,
    language,
  });
}

export function getMovieDetails(
  id: number,
  language = "en-US",
): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, { language });
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. TMDB tolerates ~50
 * req/s; a small pool keeps us well under that while still being fast.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}
