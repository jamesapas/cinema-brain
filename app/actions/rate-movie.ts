"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Rating writes.
 *
 * Server Functions are reachable by direct POST, not only through our UI, so
 * these verify the caller themselves. RLS is the real boundary — `user_id`
 * defaults to `auth.uid()` and the insert policy requires it to match — but an
 * explicit check turns "silently wrote nothing" into a clear error.
 *
 * The stars are halves of five; the column is a 1-10 smallint with a
 * CHECK (rating BETWEEN 1 AND 10), so a half-star is exactly one point.
 */

export type RateResult = { ok: true } | { ok: false; error: string };

export async function rateMovie(movieId: number, rating: number): Promise<RateResult> {
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return { ok: false, error: "That movie id isn't valid." };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return { ok: false, error: "A rating has to be a whole number from 1 to 10." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to rate films." };

  // user_id is set explicitly so the unique constraint on (user_id, movie_id)
  // can resolve the conflict; the RLS policy still requires it to be the caller.
  const { error } = await supabase.from("user_movie_ratings").upsert(
    { user_id: user.id, movie_id: movieId, rating },
    { onConflict: "user_id,movie_id" },
  );

  if (error) {
    console.error("[rateMovie]", error);
    return { ok: false, error: "Couldn't save that rating. Try again." };
  }

  // The personalized row and hero depend on ratings, so the browse page is stale
  // the moment one changes.
  revalidatePath("/");
  return { ok: true };
}

export async function clearRating(movieId: number): Promise<RateResult> {
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return { ok: false, error: "That movie id isn't valid." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to rate films." };

  const { error } = await supabase
    .from("user_movie_ratings")
    .delete()
    .eq("movie_id", movieId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[clearRating]", error);
    return { ok: false, error: "Couldn't remove that rating. Try again." };
  }

  revalidatePath("/");
  return { ok: true };
}
