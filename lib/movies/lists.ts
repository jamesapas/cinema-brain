import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { MovieCard } from "@/lib/movies/images";

/**
 * Watchlist and favorites reads.
 *
 * Two lists, one table, one column telling them apart — see the migration for
 * why. `MovieList` is the only place the stored strings are spelled out; the
 * Server Function validates against it so a hand-rolled POST can't invent a
 * third list the CHECK constraint would reject anyway.
 */

export const MOVIE_LISTS = ["watchlist", "favorite"] as const;
export type MovieList = (typeof MOVIE_LISTS)[number];

export function isMovieList(value: unknown): value is MovieList {
  return MOVIE_LISTS.includes(value as MovieList);
}

/** Which films are on which list, for the buttons on every card. */
export type ListMembership = { watchlist: number[]; favorite: number[] };

export const EMPTY_MEMBERSHIP: ListMembership = { watchlist: [], favorite: [] };

/**
 * Every listed film id in one query, split by list.
 *
 * Ids only: this runs on every page so the buttons know which state to render,
 * and it would be a whole second catalog join to hydrate rows nothing displays.
 * Signed out there is nothing to read, so callers skip it entirely.
 */
export async function getListMembership(
  supabase: SupabaseClient<Database>,
): Promise<ListMembership> {
  const { data, error } = await supabase.from("user_movie_lists").select("movie_id, list");
  if (error) throw new Error(`Failed to read lists: ${error.message}`);

  const membership: ListMembership = { watchlist: [], favorite: [] };
  for (const row of data ?? []) {
    if (isMovieList(row.list)) membership[row.list].push(row.movie_id);
  }
  return membership;
}

// Kept in step with catalog's CARD_SELECT by hand rather than by import: this
// module is imported by a client component for its types, and pulling in
// catalog.ts would drag Pinecone and the OpenAI client along with it.
const CARD_SELECT =
  "id, title, tagline, release_year, genres, runtime, vote_average, vote_count, overview, poster_path, backdrop_path";

/** One list's films, most recently added first — the profile page's sections. */
export async function getListMovies(
  supabase: SupabaseClient<Database>,
  list: MovieList,
): Promise<MovieCard[]> {
  const { data, error } = await supabase
    .from("user_movie_lists")
    .select(`movies(${CARD_SELECT})`)
    .eq("list", list)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read ${list}: ${error.message}`);

  const movies: MovieCard[] = [];
  for (const row of data ?? []) {
    // A row whose film left the catalog, or lost its artwork, has no card.
    if (row.movies?.poster_path) movies.push(row.movies);
  }
  return movies;
}
