"use server";

import { revalidatePath } from "next/cache";

import { isMovieList, type MovieList } from "@/lib/movies/lists";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Watchlist and favorites writes.
 *
 * Same posture as the rating actions: reachable by direct POST, so the caller
 * is verified here even though RLS is the real boundary.
 *
 * One toggle rather than an add and a remove. The button is a toggle, the row
 * either exists or it doesn't, and the composite primary key makes adding twice
 * a no-op — so the client sends where it wants to end up and never has to know
 * which of two calls applies.
 */

export type ListResult = { ok: true } | { ok: false; error: string };

const LABEL: Record<MovieList, string> = {
  watchlist: "watchlist",
  favorite: "favorites",
};

export async function setListMembership(
  movieId: number,
  list: MovieList,
  member: boolean,
): Promise<ListResult> {
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return { ok: false, error: "That movie id isn't valid." };
  }
  if (!isMovieList(list)) {
    return { ok: false, error: "That isn't a list." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: `Sign in to use your ${LABEL[list]}.` };

  // user_id is explicit so the primary key can resolve the conflict; the RLS
  // policy still requires it to be the caller.
  const { error } = member
    ? await supabase
        .from("user_movie_lists")
        .upsert(
          { user_id: user.id, movie_id: movieId, list },
          { onConflict: "user_id,movie_id,list" },
        )
    : await supabase
        .from("user_movie_lists")
        .delete()
        .eq("user_id", user.id)
        .eq("movie_id", movieId)
        .eq("list", list);

  if (error) {
    console.error("[setListMembership]", error);
    return { ok: false, error: `Couldn't update your ${LABEL[list]}. Try again.` };
  }

  // "layout" so it reaches /profile/watchlist and /profile/favorites too —
  // those render the lists in full and are stale the moment one changes.
  revalidatePath("/profile", "layout");
  return { ok: true };
}
