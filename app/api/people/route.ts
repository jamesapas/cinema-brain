import { MIN_SEARCH_LENGTH, searchProfiles } from "@/lib/profiles/search";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/people?q= — accounts matching a handle or name.
 *
 * The people-search twin of /api/search, and a route for the same reasons: it
 * runs on every keystroke, GET is the honest verb for a read, and the browser
 * will reuse an in-flight response rather than asking twice.
 *
 * Open to signed-out visitors, because profiles are public — `profiles` has a
 * `to anon, authenticated` select policy and has since usernames got their own
 * page. The cookie client runs the query, so RLS is still what decides.
 */

/** One page. The rail shows fewer; the /people page asks for a full one. */
const PAGE_SIZE = 20;

/** Same reasoning as the title search: past this, the answer is a better term. */
const MAX_OFFSET = 200;

function offsetParam(params: URLSearchParams): number {
  const raw = Number(params.get("offset"));
  if (!Number.isInteger(raw) || raw < 0) return 0;
  return Math.min(raw, MAX_OFFSET);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const offset = offsetParam(params);

  if (query.length < MIN_SEARCH_LENGTH) {
    return Response.json({ people: [], hasMore: false });
  }

  const supabase = await createServerSupabase();

  try {
    const { people, hasMore } = await searchProfiles(supabase, query, PAGE_SIZE, offset);
    return Response.json({ people, hasMore: hasMore && offset < MAX_OFFSET });
  } catch (error) {
    console.error("[api/people]", error);
    return Response.json({ error: "Search failed. Try again." }, { status: 500 });
  }
}
