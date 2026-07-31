"use server";

import { getRatedMoviesPaged, type RatedMoviesSort, type RatedMovie } from "@/lib/movies/catalog";
import { createServerSupabase } from "@/lib/supabase/server";

export type FetchRatedMoviesResult =
  | { ok: true; movies: RatedMovie[]; total: number; hasMore: boolean }
  | { ok: false; error: string };

export async function fetchRatedMoviesAction({
  userId,
  limit = 24,
  offset = 0,
  sort = "rating-desc",
  genre = null,
}: {
  userId: string;
  limit?: number;
  offset?: number;
  sort?: RatedMoviesSort;
  genre?: string | null;
}): Promise<FetchRatedMoviesResult> {
  try {
    const supabase = await createServerSupabase();
    const result = await getRatedMoviesPaged(supabase, userId, {
      limit,
      offset,
      sort,
      genre,
    });
    return { ok: true, ...result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load rated films";
    console.error("[fetchRatedMoviesAction]", err);
    return { ok: false, error: message };
  }
}
