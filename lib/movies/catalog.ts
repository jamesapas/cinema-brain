import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { MovieCard } from "@/lib/movies/images";
import {
  fetchMovieVectors,
  findSimilarMovieIds,
  searchByTasteVector,
} from "@/lib/movies/search";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";
import { createAdminClient } from "@/lib/supabase/admin";

// Presentation helpers live in images.ts so client components can use them
// without pulling this module's server-only dependencies. Re-exported here for
// server callers that already import from catalog.
export type { MovieCard } from "@/lib/movies/images";
export { posterUrl, backdropUrl } from "@/lib/movies/images";

/**
 * Browse-side queries and projections.
 *
 * Deliberately separate from the projection the agent's tools use: cards need
 * poster and backdrop paths, and the model has no use for image filenames — it
 * would only pay tokens to read them. Same tables, different shape.
 */

// tagline and vote_count are here for the film page: both are small, and one
// projection for cards and pages alike means there is only one thing to keep
// in step with `MovieCard`.
const CARD_SELECT =
  "id, title, tagline, release_year, genres, runtime, vote_average, vote_count, overview, poster_path, backdrop_path";


/** Drop rows that can't render — a poster-less card is just a grey box. */
function withPoster(rows: MovieCard[]): MovieCard[] {
  return rows.filter((row) => row.poster_path !== null);
}

function unwrap(
  result: { data: MovieCard[] | null; error: { message: string } | null },
  label: string,
): MovieCard[] {
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return withPoster(result.data ?? []);
}

const getCachedTrending = unstable_cache(
  async (limit: number) => {
    const admin = createAdminClient();
    return unwrap(
      await admin
        .from("movies")
        .select(CARD_SELECT)
        .order("popularity", { ascending: false, nullsFirst: false })
        .limit(limit),
      "Trending",
    );
  },
  ["catalog-trending"],
  { revalidate: 900, tags: ["catalog", "trending"] },
);

export async function getTrending(
  _supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<MovieCard[]> {
  return getCachedTrending(limit);
}

const getCachedTopRated = unstable_cache(
  async (limit: number, minVotes: number) => {
    const admin = createAdminClient();
    return unwrap(
      await admin
        .from("movies")
        .select(CARD_SELECT)
        .gte("vote_count", minVotes)
        .order("vote_average", { ascending: false, nullsFirst: false })
        .limit(limit),
      "Top rated",
    );
  },
  ["catalog-top-rated"],
  { revalidate: 3600, tags: ["catalog", "top-rated"] },
);

export async function getTopRated(
  _supabase: SupabaseClient<Database>,
  { limit = 20, minVotes = 500 }: { limit?: number; minVotes?: number } = {},
): Promise<MovieCard[]> {
  return getCachedTopRated(limit, minVotes);
}

const getCachedByGenre = unstable_cache(
  async (genre: string, limit: number) => {
    const admin = createAdminClient();
    return unwrap(
      await admin
        .from("movies")
        .select(CARD_SELECT)
        .overlaps("genres", [genre])
        .order("popularity", { ascending: false, nullsFirst: false })
        .limit(limit),
      `Genre ${genre}`,
    );
  },
  ["catalog-by-genre"],
  { revalidate: 1800, tags: ["catalog", "by-genre"] },
);

export async function getByGenre(
  _supabase: SupabaseClient<Database>,
  genre: string,
  limit = 20,
): Promise<MovieCard[]> {
  return getCachedByGenre(genre, limit);
}

export async function hydrateCards(
  supabase: SupabaseClient<Database>,
  ids: number[],
): Promise<Map<number, MovieCard>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from("movies").select(CARD_SELECT).in("id", ids);
  if (error) throw new Error(`Failed to load movie cards: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.id, row]));
}

/** One film, for its own page. Null when the id isn't in the catalog. */
const getCachedMovieById = unstable_cache(
  async (id: number) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("movies")
      .select(CARD_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Movie ${id} lookup failed: ${error.message}`);
    return data;
  },
  ["catalog-movie-by-id"],
  { revalidate: 3600, tags: ["catalog", "movie-by-id"] },
);

export async function getMovieById(
  _supabase: SupabaseClient<Database>,
  id: number,
): Promise<MovieCard | null> {
  return getCachedMovieById(id);
}

/**
 * A shelf is only worth scrolling if the films on it are ones you might have
 * heard of. The catalog's long tail is films with a dozen votes, and raw vector
 * neighbours are full of them.
 */
const RELATED_MIN_VOTES = 500;

/** Below this many survivors, the floor is costing more than it's buying. */
const RELATED_MIN_RESULTS = 6;

/**
 * "More like this" — the films nearest this one in meaning.
 *
 * Vectors rather than TMDB's own `/recommendations`: both are free, so quality
 * decided it. TMDB's list is behavioural ("people who watched this also
 * watched") and drifts — it answers *Scary Movie* with 21 Jump Street and Black
 * Dynamite, where the vectors answer with Scary Movie 2, Scream and Stan
 * Helsing. It also needs no OpenAI call, since the query is the film's own
 * stored vector.
 *
 * Over-fetching is deliberate and free (see `findSimilarMovieIds`): 100
 * candidates go to Postgres, where a popularity floor does the work Pinecone
 * can't, because the vector metadata carries no vote count. Roughly a third
 * survive for a mainstream film. An obscure one keeps almost nothing, so the
 * floor drops away entirely rather than returning a shelf of three.
 */
const getCachedRelatedMovies = unstable_cache(
  async (movieId: number, limit: number) => {
    // 40 candidates is plenty for filtering top 20 popular matches,
    // reducing Pinecone lookup latency and Postgres IN query payload size by 60%.
    const scores = await findSimilarMovieIds(movieId, 40);
    if (scores.size === 0) return [];

    const ids = [...scores.keys()];
    const admin = createAdminClient();

    let rows = unwrap(
      await admin
        .from("movies")
        .select(CARD_SELECT)
        .in("id", ids)
        .gte("vote_count", RELATED_MIN_VOTES),
      "Related films",
    );

    if (rows.length < RELATED_MIN_RESULTS) {
      // Second Postgres query, no second Pinecone read — the candidates are
      // already in hand.
      rows = unwrap(
        await admin.from("movies").select(CARD_SELECT).in("id", ids),
        "Related films",
      );
    }

    // Postgres returns `in()` rows in arbitrary order; similarity is the whole
    // point of the list, so impose it here.
    return rows
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, limit);
  },
  ["catalog-related-movies"],
  { revalidate: 3600, tags: ["catalog", "related-movies"] },
);

export async function getRelatedMovies(
  _supabase: SupabaseClient<Database>,
  movieId: number,
  limit = 20,
): Promise<MovieCard[]> {
  return getCachedRelatedMovies(movieId, limit);
}

/** The user's ratings keyed by movie, so cards can show current star state. */
export const getRatingsByMovie = cache(async (
  supabase: SupabaseClient<Database>,
  userId?: string,
): Promise<Map<number, number>> => {
  const targetUserId = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!targetUserId) return new Map();

  const { data, error } = await supabase
    .from("user_movie_ratings")
    .select("movie_id, rating")
    .eq("user_id", targetUserId);

  if (error) throw new Error(`Failed to read ratings: ${error.message}`);

  const entries: [number, number][] = [];
  for (const row of data ?? []) {
    if (row.rating !== null) entries.push([row.movie_id, row.rating]);
  }
  return new Map(entries);
});

/**
 * `%` and `_` are wildcards in LIKE, so a query containing them would quietly
 * mean something other than what was typed.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type TitleSearch = {
  movies: MovieCard[];
  /** True when another page exists past the one returned. */
  hasMore: boolean;
};

/**
 * Title search, served by the trigram index on `movies.title`.
 *
 * Postgres, not vectors: at this size the question a search box gets asked is
 * "do you have this film", which is a lookup. Describing a film you can't name
 * is what the agent's semantic tool is for.
 *
 * Results come back by popularity, then get re-ranked into three tiers: an
 * exact title, then titles starting with the query, then titles merely
 * containing it. Popularity alone puts Her fifth behind Hereditary and
 * Hercules when you type "her", which is the wrong answer to an exact name.
 * Doing the re-rank in memory keeps this to one query and needs no database
 * function.
 *
 * `offset` pages the same ordering for the overlay's infinite scroll. The tier
 * re-rank applies within the returned window, which is what you want: the
 * window is a contiguous slice of one global popularity order, so paging never
 * repeats or skips a row, and the exact-title promotion still lands on the
 * first page where it matters.
 */
export async function searchMoviesByTitle(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 60,
  offset = 0,
): Promise<TitleSearch> {
  const term = query.trim();
  if (term.length < MIN_SEARCH_LENGTH) return { movies: [], hasMore: false };

  const pattern = `%${escapeLikePattern(term)}%`;

  // One row past the window is how we know another page exists without paying
  // for a count over 104k rows.
  const { data, error } = await supabase
    .from("movies")
    .select(CARD_SELECT)
    .ilike("title", pattern)
    .order("popularity", { ascending: false, nullsFirst: false })
    // Popularity ties are common and Postgres makes no promise about their
    // order between queries. Without a unique tiebreak, two overlapping
    // windows can hand back the same film twice and drop another entirely.
    .order("id", { ascending: true })
    .range(offset, offset + limit);

  if (error) throw new Error(`Search failed: ${error.message}`);

  const rows = withPoster(data ?? []);
  const hasMore = (data?.length ?? 0) > limit;

  const lower = term.toLowerCase();
  const exact: MovieCard[] = [];
  const startsWith: MovieCard[] = [];
  const contains: MovieCard[] = [];

  for (const row of rows) {
    const title = row.title.toLowerCase();
    if (title === lower) exact.push(row);
    else if (title.startsWith(lower)) startsWith.push(row);
    else contains.push(row);
  }

  // Each tier stays in popularity order, so two films sharing a title still
  // come back best-known first.
  return {
    movies: [...exact, ...startsWith, ...contains].slice(0, limit),
    hasMore,
  };
}

export type RatedMovie = {
  movie: MovieCard;
  rating: number;
  notes: string | null;
  ratedAt: string;
};

/**
 * Every film a user has scored, best first — a profile page's whole dataset,
 * owner's or not. One query: the ratings carry their movie rows with them
 * rather than being hydrated in a second pass.
 *
 * Ratings are publicly readable now, so `userId` is required rather than
 * left to RLS to narrow — an unfiltered query here would return everyone's.
 */
export async function getRatedMovies(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RatedMovie[]> {
  const { data, error } = await supabase
    .from("user_movie_ratings")
    .select(`rating, notes, created_at, movies(${CARD_SELECT})`)
    .eq("user_id", userId)
    .not("rating", "is", null)
    .order("rating", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to read rated films: ${error.message}`);

  const rated: RatedMovie[] = [];
  for (const row of data ?? []) {
    // A rating whose film left the catalog has nothing to render.
    if (!row.movies || row.rating === null) continue;
    rated.push({
      movie: row.movies,
      rating: row.rating,
      notes: row.notes,
      ratedAt: row.created_at,
    });
  }
  return rated;
}

export type TopPicksForYou = {
  movies: MovieCard[];
  tasteSummary: string | null;
};

/**
 * Maps star rating (1–10) to a weight for composite vector accumulation.
 * 9-10: +2.5 to +3.0
 * 7-8: +1.0 to +1.5
 * 5-6: 0.0 (neutral)
 * 1-4: -1.0 to -2.0 (negative push)
 */
function ratingToWeight(rating: number): number {
  if (rating >= 10) return 3.0;
  if (rating >= 9) return 2.5;
  if (rating >= 8) return 1.5;
  if (rating >= 7) return 1.0;
  if (rating >= 5) return 0.0;
  if (rating >= 3) return -1.0;
  return -2.0;
}

/**
 * Computes dynamic taste summary string from rated movies (e.g. top genres among 6+ star ratings).
 */
function deriveTasteSummary(ratedItems: { rating: number; genres: string[] }[]): string | null {
  const counts = new Map<string, number>();
  for (const item of ratedItems) {
    if (item.rating < 6) continue;
    const weight = item.rating >= 8 ? 2 : 1;
    for (const genre of item.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + weight);
    }
  }

  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((entry) => entry[0]);
  const topGenres = sorted.slice(0, 3);

  if (topGenres.length === 1) {
    return `Based on your love for ${topGenres[0]}`;
  } else if (topGenres.length === 2) {
    return `Based on your ratings in ${topGenres[0]} & ${topGenres[1]}`;
  } else {
    return `Based on your ratings in ${topGenres[0]}, ${topGenres[1]} & ${topGenres[2]}`;
  }
}

const getCachedTopPicks = unstable_cache(
  async (userId: string, limit: number) => {
    const admin = createAdminClient();

    const { data: userRatings, error } = await admin
      .from("user_movie_ratings")
      .select("movie_id, rating, movies(title, genres)")
      .eq("user_id", userId)
      .not("rating", "is", null);

    if (error || !userRatings || userRatings.length === 0) return null;

    const ratedItems = userRatings
      .filter((r): r is typeof r & { movies: { title: string; genres: string[] } } =>
        Boolean(r.movies && r.rating !== null),
      )
      .map((r) => ({
        movieId: r.movie_id,
        rating: r.rating!,
        title: r.movies.title,
        genres: r.movies.genres,
      }));

    if (ratedItems.length === 0) return null;

    const ratedMovieIds = new Set(ratedItems.map((item) => item.movieId));
    const tasteSummary = deriveTasteSummary(ratedItems);

    // Single rating fallback: if only 1 rating, use nearest vector neighbors of that movie
    if (ratedItems.length === 1) {
      const seedMovie = ratedItems[0];
      const related = await getRelatedMovies(admin, seedMovie.movieId, limit + 5);
      const filtered = related.filter((m) => !ratedMovieIds.has(m.id)).slice(0, limit);
      return {
        movies: filtered,
        tasteSummary: `Based on your rating for ${seedMovie.title}`,
      };
    }

    // Cap vector fetch to top 15 most influential ratings (highest rated + newest)
    // to prevent fetching dozens of 1536-dim vectors unnecessarily from Pinecone
    const topRatedItems = [...ratedItems]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 15);

    const vectorMap = await fetchMovieVectors(topRatedItems.map((item) => item.movieId));

    let dim = 1536;
    const compositeVector = new Float64Array(dim);
    let totalWeight = 0;

    for (const item of topRatedItems) {
      const vec = vectorMap.get(item.movieId);
      if (!vec || vec.length === 0) continue;
      dim = vec.length;
      const weight = ratingToWeight(item.rating);
      if (weight === 0) continue;

      totalWeight += Math.abs(weight);
      for (let i = 0; i < dim; i++) {
        compositeVector[i] += vec[i] * weight;
      }
    }

    // If no weights accumulated or vectors missing, fallback to highest rated movie's neighbors
    if (totalWeight === 0) {
      const topRatedItem = [...ratedItems].sort((a, b) => b.rating - a.rating)[0];
      const related = await getRelatedMovies(admin, topRatedItem.movieId, limit + 5);
      return {
        movies: related.filter((m) => !ratedMovieIds.has(m.id)).slice(0, limit),
        tasteSummary,
      };
    }

    // L2 Normalize composite vector to unit vector for Cosine similarity
    let magnitudeSq = 0;
    for (let i = 0; i < dim; i++) {
      magnitudeSq += compositeVector[i] * compositeVector[i];
    }
    const magnitude = Math.sqrt(magnitudeSq);

    if (magnitude === 0) return null;

    const normalizedVector: number[] = new Array(dim);
    for (let i = 0; i < dim; i++) {
      normalizedVector[i] = compositeVector[i] / magnitude;
    }

    // Over-fetch vector candidates from Pinecone (100 matches)
    const scores = await searchByTasteVector(normalizedVector, 100);
    if (scores.size === 0) return null;

    // Filter out already rated movies
    const candidateIds = [...scores.keys()].filter((id) => !ratedMovieIds.has(id));
    if (candidateIds.length === 0) return null;

    // Apply vote count floor (same as getRelatedMovies)
    let rows = unwrap(
      await admin
        .from("movies")
        .select(CARD_SELECT)
        .in("id", candidateIds)
        .gte("vote_count", RELATED_MIN_VOTES),
      "Top picks",
    );

    if (rows.length < RELATED_MIN_RESULTS) {
      rows = unwrap(
        await admin.from("movies").select(CARD_SELECT).in("id", candidateIds),
        "Top picks",
      );
    }

    // Sort by Pinecone similarity score descending
    const ordered = rows
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, limit);

    return {
      movies: ordered,
      tasteSummary,
    };
  },
  ["user-top-picks-v1"],
  { revalidate: 900, tags: ["top-picks"] },
);

/**
 * "Top Picks for You" — recommendations derived from the user's composite vector taste profile.
 * Cached per user via unstable_cache for 15 minutes.
 */
export async function getTopPicksForYou(
  supabase: SupabaseClient<Database>,
  userId?: string,
  limit = 20,
): Promise<TopPicksForYou | null> {
  const targetUserId = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!targetUserId) return null;

  return getCachedTopPicks(targetUserId, limit);
}

export type BecauseYouRated = {
  seed: { title: string; rating: number };
  movies: MovieCard[];
};

/** Deprecated backward-compatible wrapper for getTopPicksForYou */
export async function getBecauseYouRated(
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<BecauseYouRated | null> {
  const picks = await getTopPicksForYou(supabase, undefined, limit);
  if (!picks || picks.movies.length === 0) return null;
  return {
    seed: { title: picks.tasteSummary ?? "Your Top Picks", rating: 10 },
    movies: picks.movies,
  };
}


/**
 * Feature film for the hero: well-regarded, has a backdrop, and the user hasn't
 * rated it — a hero for something they've already seen wastes the slot.
 */
export async function getHeroMovie(
  supabase: SupabaseClient<Database>,
  excludeIds: number[] = [],
): Promise<MovieCard | null> {
  let query = supabase
    .from("movies")
    .select(CARD_SELECT)
    .not("backdrop_path", "is", null)
    .gte("vote_count", 400)
    .gte("vote_average", 7)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(1);

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Hero query failed: ${error.message}`);

  return data?.[0] ?? null;
}
