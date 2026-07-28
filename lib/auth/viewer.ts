import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getProfile, type Profile } from "@/lib/profiles/queries";

/**
 * Who is looking at the page — or null, which is now a normal answer.
 *
 * The catalog is public: browsing, opening a film, and searching titles all
 * work signed out. Only the personal actions (rating, chatting with Kino,
 * the profile page) need an account, so every page that renders the shell
 * asks for a viewer and is expected to cope with not getting one.
 */
export type Viewer = {
  id: string;
  email: string;
  /** The handle they can also sign in with. Null only for a missing profile. */
  username: string | null;
  /** The raw row, for the profile page's editor. Null before the trigger ran. */
  profile: Profile | null;
  /** The account's own timestamp, the fallback when there is no profile row. */
  createdAt: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
};

/**
 * `getUser` rather than `getSession`: this is what validates the token with
 * Supabase, and it is what everything downstream trusts. Wrapped in React `cache`
 * to deduplicate user identity checks within a single request context.
 */
export const getViewer = cache(async (
  supabase: SupabaseClient<Database>,
): Promise<Viewer | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  const email = user.email ?? "signed in";

  return {
    id: user.id,
    email,
    username: profile?.username ?? null,
    profile,
    createdAt: user.created_at,
    displayName: displayNameFor(profile?.display_name ?? null, email),
    avatarUrl: avatarUrl(profile?.avatar_path),
    initials: initialsFor(profile?.display_name ?? null, email),
  };
});
