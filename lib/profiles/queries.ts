import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Profile reads. Selects are public now (any profile can be looked up by
 * username for its own page), so callers filter explicitly rather than
 * leaning on RLS to narrow an unfiltered query down to one row.
 */

const PROFILE_SELECT =
  "id, username, display_name, avatar_path, bio, created_at, taste_summary, taste_summary_key, taste_summary_at";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  created_at: string;
  /** Kino's cached read on this user's taste, and the ratings it was written from. */
  taste_summary: string | null;
  taste_summary_key: string | null;
  taste_summary_at: string | null;
};

/**
 * A profile row is created by a trigger on signup, but a null here is not an
 * error: an account created before that trigger existed, or a row that failed
 * to backfill, should still render a usable page.
 */
export async function getProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read profile: ${error.message}`);
  return data;
}

/**
 * Someone else's profile, by the handle in the URL. Profile reads are public
 * now, so this is a plain lookup rather than an RLS-scoped "own row" query.
 */
export async function getProfileByUsername(
  supabase: SupabaseClient<Database>,
  username: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to read profile: ${error.message}`);
  return data;
}
