import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Profile reads. RLS scopes every one of these to the caller, so there is no
 * user id parameter — asking for "the profile" can only ever mean your own.
 */

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  created_at: string;
};

/**
 * A profile row is created by a trigger on signup, but a null here is not an
 * error: an account created before that trigger existed, or a row that failed
 * to backfill, should still render a usable page.
 */
export async function getProfile(
  supabase: SupabaseClient<Database>,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, created_at")
    .maybeSingle();

  if (error) throw new Error(`Failed to read profile: ${error.message}`);
  return data;
}
