import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";

/**
 * Finding people.
 *
 * A second search, deliberately separate from the one in the header. That one
 * answers "does the catalog have this film" and is the only thing the nav bar's
 * magnifier and Cmd-K do; this one answers "is so-and-so on here", lives on the
 * feed and its own page, and never touches films. Two questions, two boxes —
 * one box that sometimes returns people and sometimes films would make you
 * guess which mode you were in before typing.
 *
 * Matching is `ilike '%term%'` over the handle and the display name, served by
 * the two trigram indexes added alongside the posts tables.
 */

/** Same floor as the title search, and for the same reason: one letter matches everyone. */
export { MIN_SEARCH_LENGTH };

export type ProfileResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  bio: string | null;
};

export type PeopleSearch = {
  people: ProfileResult[];
  /** True when another page exists past the one returned. */
  hasMore: boolean;
};

/**
 * What survives of a typed term.
 *
 * Two different escapes are needed and they are not the same job. `%` and `_`
 * are LIKE wildcards, so they are backslash-escaped or the query quietly means
 * something else. Commas and parentheses are PostgREST's own `or=(...)`
 * grammar, which has no escape available through supabase-js — a term
 * containing one would produce a malformed filter rather than no results, so
 * those characters are dropped instead.
 *
 * A leading "@" goes too. People type handles the way they read them.
 */
function searchTerm(query: string): string {
  return query
    .trim()
    .replace(/^@+/, "")
    .replace(/[(),]/g, "")
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .trim();
}

/**
 * Accounts matching a handle or a display name.
 *
 * Results come back alphabetically by handle — there is no popularity column to
 * order people by, and alphabetical is at least stable across pages — then get
 * the same three-tier re-rank the title search uses: an exact handle, then
 * handles and names starting with the term, then everything else containing it.
 * Typing someone's whole handle should put them first, not fifth behind four
 * accounts that merely contain it.
 */
export async function searchProfiles(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 20,
  offset = 0,
): Promise<PeopleSearch> {
  const term = searchTerm(query);
  if (term.length < MIN_SEARCH_LENGTH) return { people: [], hasMore: false };

  const pattern = `%${term}%`;

  // One row past the window, so "is there more" costs no second count query.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, bio")
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order("username", { ascending: true })
    .range(offset, offset + limit);

  if (error) throw new Error(`People search failed: ${error.message}`);

  const rows = data ?? [];
  const hasMore = rows.length > limit;

  const lower = term.toLowerCase();
  const exact: ProfileResult[] = [];
  const startsWith: ProfileResult[] = [];
  const contains: ProfileResult[] = [];

  for (const row of rows.slice(0, limit)) {
    const handle = row.username.toLowerCase();
    const name = (row.display_name ?? "").toLowerCase();

    if (handle === lower || name === lower) exact.push(row);
    else if (handle.startsWith(lower) || name.startsWith(lower)) startsWith.push(row);
    else contains.push(row);
  }

  return { people: [...exact, ...startsWith, ...contains], hasMore };
}

/**
 * People worth following, for the rail beside the feed.
 *
 * Not a recommender. It is "accounts you aren't already following, most
 * recently joined first" — which on a site this size is the honest answer, and
 * costs one indexed read. The exclusion list is the follow graph the page
 * already has plus the viewer themselves.
 */
export async function getSuggestedProfiles(
  supabase: SupabaseClient<Database>,
  excludeIds: string[],
  limit = 5,
): Promise<ProfileResult[]> {
  let query = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, bio")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to read suggestions: ${error.message}`);

  return data ?? [];
}
