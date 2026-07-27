"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Follow/unfollow. Like the other mutations here, RLS is the real boundary —
 * `follower_id` can only ever be the caller's own id — this just turns a
 * denied write into a message instead of a silent no-op.
 */

export type FollowResult = { ok: true } | { ok: false; error: string };

export async function follow(targetId: string, targetUsername: string): Promise<FollowResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to follow people." };
  if (user.id === targetId) return { ok: false, error: "You can't follow yourself." };

  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, followee_id: targetId });

  // Already following: not an error, just a no-op.
  if (error && error.code !== "23505") {
    console.error("[follow]", error);
    return { ok: false, error: "Couldn't follow them. Try again." };
  }

  revalidatePath(`/${targetUsername}`);
  return { ok: true };
}

export async function unfollow(targetId: string, targetUsername: string): Promise<FollowResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to follow people." };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", targetId);

  if (error) {
    console.error("[unfollow]", error);
    return { ok: false, error: "Couldn't unfollow them. Try again." };
  }

  revalidatePath(`/${targetUsername}`);
  return { ok: true };
}
