import { looksLikeEmail, normalizeUsername } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turning what someone typed into the address Supabase Auth knows them by.
 *
 * One door takes "email or username": signing in. It needs the answer *before*
 * there is a session, which means reading a profile row the caller doesn't own
 * yet. That's service role, so this file must never be imported from anything
 * that reaches the browser bundle.
 *
 * Asking for a reset link used to come through here too. It asks for the
 * address directly now — a handle is forgettable alongside the password, and
 * the link has to be mailed to an address either way.
 *
 * The result is used and discarded on the server. The endpoint doesn't return
 * it, so it can't be walked to map handles to email addresses.
 */
export async function emailForIdentifier(identifier: string): Promise<string | null> {
  const typed = identifier.trim();
  if (!typed) return null;

  // An "@" is the whole test: usernames can't contain one, so anything with it
  // is already the address and needs no lookup.
  if (looksLikeEmail(typed)) return typed;

  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", normalizeUsername(typed))
    .maybeSingle();

  if (error) {
    console.error("[emailForIdentifier] username lookup", error);
    return null;
  }
  if (!profile) return null;

  // The handle lives in `profiles`; the address lives in `auth.users`, which
  // only the admin API reaches.
  const { data, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError) {
    console.error("[emailForIdentifier] user lookup", userError);
    return null;
  }

  return data.user?.email ?? null;
}
