import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export type FollowCounts = { followers: number; following: number };

export type FollowProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
};

/**
 * Profiles for a set of ids, in the order given. `follows` has no FK to
 * `profiles` for PostgREST to embed (it points at `auth.users`), so listing
 * either side of a follow relationship is a two-step: the edges, then the
 * profiles they name.
 */
async function profilesInOrder(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<FollowProfile[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path")
    .in("id", ids);

  if (error) throw new Error(`Failed to read profiles: ${error.message}`);

  const byId = new Map(data.map((profile) => [profile.id, profile]));
  return ids.map((id) => byId.get(id)).filter((profile) => profile !== undefined);
}

/** Everyone who follows `userId`, most recent follow first. */
export async function getFollowers(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FollowProfile[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read followers: ${error.message}`);
  return profilesInOrder(supabase, data.map((row) => row.follower_id));
}

/** Everyone `userId` follows, most recent follow first. */
export async function getFollowing(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FollowProfile[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read following: ${error.message}`);
  return profilesInOrder(supabase, data.map((row) => row.followee_id));
}

/** Who the viewer follows, as a set — for marking a list of profiles in one query. */
export async function getFollowingIds(
  supabase: SupabaseClient<Database>,
  viewerId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", viewerId);

  if (error) throw new Error(`Failed to read follow state: ${error.message}`);
  return new Set(data.map((row) => row.followee_id));
}

/** Follower and following counts for one account, read off the same table. */
export async function getFollowCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FollowCounts> {
  const [followers, following] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);

  if (followers.error) throw new Error(`Failed to count followers: ${followers.error.message}`);
  if (following.error) throw new Error(`Failed to count following: ${following.error.message}`);

  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

/** Whether `viewerId` already follows `targetId`. */
export async function isFollowing(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("followee_id", targetId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read follow state: ${error.message}`);
  return data !== null;
}
