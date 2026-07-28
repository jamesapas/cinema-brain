import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { embedTexts } from "@/lib/embeddings/openai";
import { getMoviesIndex } from "@/lib/pinecone";

/** The genre vocabulary actually present in the catalog. */
export const CATALOG_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "TV Movie",
  "War",
  "Western",
] as const;

/** Compact projection handed to the model — full rows would waste context. */
const MOVIE_SELECT =
  "id, title, release_year, genres, runtime, vote_average, vote_count, overview";

export type MovieSummary = {
  movie_id: number;
  title: string;
  year: number | null;
  genres: string[];
  runtime: number | null;
  rating: number | null;
  overview: string | null;
};

type MovieProjection = {
  id: number;
  title: string;
  release_year: number | null;
  genres: string[];
  runtime: number | null;
  vote_average: number | null;
  vote_count: number | null;
  overview: string | null;
};

function toSummary(row: MovieProjection): MovieSummary {
  return {
    movie_id: row.id,
    title: row.title,
    year: row.release_year,
    genres: row.genres,
    runtime: row.runtime,
    rating: row.vote_average,
    overview: row.overview,
  };
}

export type MetadataSearchInput = {
  genres?: string[];
  genreMatch?: "any" | "all";
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  minVotes?: number;
  titleContains?: string;
  sortBy?: "popularity" | "rating" | "newest" | "oldest";
  limit?: number;
};

export async function searchByMetadata(
  supabase: SupabaseClient<Database>,
  input: MetadataSearchInput,
): Promise<MovieSummary[]> {
  let query = supabase.from("movies").select(MOVIE_SELECT);

  if (input.genres && input.genres.length > 0) {
    // `overlaps` = has any of these genres; `contains` = has all of them.
    query =
      input.genreMatch === "all"
        ? query.contains("genres", input.genres)
        : query.overlaps("genres", input.genres);
  }
  if (input.yearFrom !== undefined) query = query.gte("release_year", input.yearFrom);
  if (input.yearTo !== undefined) query = query.lte("release_year", input.yearTo);
  if (input.minRating !== undefined) query = query.gte("vote_average", input.minRating);
  if (input.minVotes !== undefined) query = query.gte("vote_count", input.minVotes);
  if (input.titleContains) query = query.ilike("title", `%${input.titleContains}%`);

  switch (input.sortBy) {
    case "rating":
      query = query.order("vote_average", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      query = query.order("release_year", { ascending: false, nullsFirst: false });
      break;
    case "oldest":
      query = query.order("release_year", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("popularity", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(input.limit ?? 10);
  if (error) throw new Error(`Metadata search failed: ${error.message}`);

  return (data ?? []).map(toSummary);
}

export type SemanticSearchInput = {
  query: string;
  genres?: string[];
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
};

export type SemanticMatch = MovieSummary & { similarity: number };

export async function searchByMeaning(
  supabase: SupabaseClient<Database>,
  input: SemanticSearchInput,
): Promise<SemanticMatch[]> {
  const { embeddings } = await embedTexts([input.query]);

  // Filters are applied inside the vector query so we don't over-fetch and
  // discard, which would silently shrink results below the requested limit.
  const filter: Record<string, unknown> = {};
  if (input.genres && input.genres.length > 0) filter.genres = { $in: input.genres };
  if (input.yearFrom !== undefined || input.yearTo !== undefined) {
    filter.release_year = {
      ...(input.yearFrom !== undefined && { $gte: input.yearFrom }),
      ...(input.yearTo !== undefined && { $lte: input.yearTo }),
    };
  }

  const response = await getMoviesIndex().query({
    vector: embeddings[0],
    topK: input.limit ?? 10,
    includeMetadata: true,
    ...(Object.keys(filter).length > 0 && { filter }),
  });

  const matches = response.matches ?? [];
  if (matches.length === 0) return [];

  const scoreById = new Map(matches.map((m) => [Number(m.id), m.score ?? 0]));

  // Hydrate from Postgres rather than trusting vector metadata: it's the
  // source of truth and carries fields the vectors deliberately omit.
  const { data, error } = await supabase
    .from("movies")
    .select(MOVIE_SELECT)
    .in("id", [...scoreById.keys()]);

  if (error) throw new Error(`Failed to hydrate semantic matches: ${error.message}`);

  return (data ?? [])
    .map((row) => ({
      ...toSummary(row),
      similarity: scoreById.get(row.id) ?? 0,
    }))
    // Postgres returns rows in arbitrary order, and Pinecone's own ordering
    // isn't guaranteed when topK meets the vector count — sort explicitly.
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Neighbours of a film already in the index, keyed by id with their similarity.
 *
 * Queries Pinecone **by stored vector id**, so this costs no embedding call at
 * all — the vector was paid for at sync time. `topK` is also free: 13, 50 and
 * 100 were measured to bill exactly one read unit each, so callers should
 * over-fetch and filter rather than ask for only what they intend to show.
 *
 * A film with no vector — never embedded, or withdrawn since — comes back as an
 * empty map rather than throwing: Pinecone answers an unknown id with zero
 * matches, not an error.
 */
export async function findSimilarMovieIds(
  movieId: number,
  limit = 100,
): Promise<Map<number, number>> {
  const response = await getMoviesIndex().query({
    id: String(movieId),
    topK: limit,
  });

  const scores = new Map<number, number>();
  for (const match of response.matches ?? []) {
    scores.set(Number(match.id), match.score ?? 0);
  }

  // A film is always its own nearest neighbour, at similarity 1.
  scores.delete(movieId);
  return scores;
}

/**
 * Fetches stored vector embeddings from Pinecone for a list of movie IDs.
 * Uses Pinecone's fetch API (costs 0 OpenAI embedding calls).
 */
export async function fetchMovieVectors(
  movieIds: number[],
): Promise<Map<number, number[]>> {
  if (movieIds.length === 0) return new Map();

  const stringIds = movieIds.map(String);
  const response = await getMoviesIndex().fetch({ ids: stringIds });

  const vectors = new Map<number, number[]>();
  if (response.records) {
    for (const [idStr, record] of Object.entries(response.records)) {
      if (record?.values && record.values.length > 0) {
        vectors.set(Number(idStr), record.values);
      }
    }
  }

  return vectors;
}

/**
 * Queries Pinecone using a raw vector embedding array (e.g. a user taste profile vector).
 */
export async function searchByTasteVector(
  vector: number[],
  limit = 100,
): Promise<Map<number, number>> {
  const response = await getMoviesIndex().query({
    vector,
    topK: limit,
  });

  const scores = new Map<number, number>();
  for (const match of response.matches ?? []) {
    scores.set(Number(match.id), match.score ?? 0);
  }

  return scores;
}


export type UserRating = {
  movie_id: number;
  title: string;
  year: number | null;
  genres: string[];
  rating: number | null;
  notes: string | null;
  watched_at: string | null;
};

export type RatingHistoryInput = {
  minRating?: number;
  limit?: number;
};

/**
 * The signed-in user's ratings. RLS scopes this to their own rows — it returns
 * nothing when the client isn't authenticated, rather than erroring.
 */
export async function getRatingHistory(
  supabase: SupabaseClient<Database>,
  input: RatingHistoryInput = {},
): Promise<UserRating[]> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return [];

  let query = supabase
    .from("user_movie_ratings")
    .select("movie_id, rating, notes, watched_at, movies(title, release_year, genres)")
    .eq("user_id", user.id)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (input.minRating !== undefined) query = query.gte("rating", input.minRating);

  const { data, error } = await query.limit(input.limit ?? 50);
  if (error) throw new Error(`Failed to read rating history: ${error.message}`);

  return (data ?? []).map((row) => ({
    movie_id: row.movie_id,
    title: row.movies?.title ?? "(unknown)",
    year: row.movies?.release_year ?? null,
    genres: row.movies?.genres ?? [],
    rating: row.rating,
    notes: row.notes,
    watched_at: row.watched_at,
  }));
}

export async function hydrateMovies(
  supabase: SupabaseClient<Database>,
  movieIds: number[],
): Promise<Map<number, MovieSummary>> {
  if (movieIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("movies")
    .select(MOVIE_SELECT)
    .in("id", movieIds);

  if (error) throw new Error(`Failed to load movies: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.id, toSummary(row)]));
}
