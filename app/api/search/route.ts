import { searchMoviesByTitle } from "@/lib/movies/catalog";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/search?q= — title matches for the search overlay.
 *
 * A route rather than a Server Function because this is a read that runs on
 * every keystroke: GET is the honest verb, and the browser will reuse an
 * in-flight response for a repeated query rather than posting again.
 *
 * Open to signed-out visitors, because browsing is. The cookie client is still
 * what runs the query, so this is RLS reading a table that is deliberately
 * public — nothing in `movies` is anyone's private data, and no other table is
 * reachable from here. Ratings, chats, and profiles stay `to authenticated`.
 */

/** One page. The overlay asks for the next one as you reach the end. */
const PAGE_SIZE = 12;

/**
 * A deep offset makes Postgres walk every row it skips, so this is capped
 * rather than left open — past a few hundred title matches, the answer is a
 * better query, not more scrolling.
 */
const MAX_OFFSET = 480;

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
    return Response.json({ movies: [], hasMore: false });
  }

  const supabase = await createServerSupabase();

  try {
    const { movies, hasMore } = await searchMoviesByTitle(supabase, query, PAGE_SIZE, offset);
    // The cap is the end of the road, so stop inviting the next page at it.
    return Response.json({ movies, hasMore: hasMore && offset < MAX_OFFSET });
  } catch (error) {
    console.error("[api/search]", error);
    return Response.json({ error: "Search failed. Try again." }, { status: 500 });
  }
}
