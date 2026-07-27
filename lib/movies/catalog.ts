import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { MovieCard } from "@/lib/movies/images";
import { findSimilarMovieIds, searchByMeaning } from "@/lib/movies/search";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";

// Presentation helpers live in images.ts so client components can use them
// without pulling this module's server-only dependencies. Re-exported here for
// server callers that already import from catalog.
export type { MovieCard } from "@/lib/movies/images";
export { posterUrl, backdropUrl } from "@/lib/movies/images";

/**
 * Browse-side queries and projections.
 *
 * Deliberately separate from the projection the agent's tools use: cards need
 * poster and backdrop paths, and the model has no use for image filenames — it
 * would only pay tokens to read them. Same tables, different shape.
 */

// tagline and vote_count are here for the film page: both are small, and one
// projection for cards and pages alike means there is only one thing to keep
// in step with `MovieCard`.
const CARD_SELECT =
  "id, title, tagline, release_year, genres, runtime, vote_average, vote_count, overview, poster_path, backdrop_path";


/** Drop rows that can't render — a poster-less card is just a grey box. */
function withPoster(rows: MovieCard[]): MovieCard[] {
  return rows.filter((row) => row.poster_path !== null);
}

function unwrap(
  result: { data: MovieCard[] | null; error: { message: string } | null },
  label: string,
): MovieCard[] {
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return withPoster(result.data ?? []);
}

export async function getTrending(
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<MovieCard[]> {
  return unwrap(
    await supabase
      .from("movies")
      .select(CARD_SELECT)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(limit),
    "Trending",
  );
}

export async function getTopRated(
  supabase: SupabaseClient<Database>,
  { limit = 20, minVotes = 500 }: { limit?: number; minVotes?: number } = {},
): Promise<MovieCard[]> {
  return unwrap(
    await supabase
      .from("movies")
      .select(CARD_SELECT)
      .gte("vote_count", minVotes)
      .order("vote_average", { ascending: false, nullsFirst: false })
      .limit(limit),
    "Top rated",
  );
}

export async function getByGenre(
  supabase: SupabaseClient<Database>,
  genre: string,
  limit = 20,
): Promise<MovieCard[]> {
  return unwrap(
    await supabase
      .from("movies")
      .select(CARD_SELECT)
      .overlaps("genres", [genre])
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(limit),
    `Genre ${genre}`,
  );
}

export async function hydrateCards(
  supabase: SupabaseClient<Database>,
  ids: number[],
): Promise<Map<number, MovieCard>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from("movies").select(CARD_SELECT).in("id", ids);
  if (error) throw new Error(`Failed to load movie cards: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.id, row]));
}

/** One film, for its own page. Null when the id isn't in the catalog. */
export async function getMovieById(
  supabase: SupabaseClient<Database>,
  id: number,
): Promise<MovieCard | null> {
  const { data, error } = await supabase
    .from("movies")
    .select(CARD_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Movie ${id} lookup failed: ${error.message}`);
  return data;
}

/**
 * A shelf is only worth scrolling if the films on it are ones you might have
 * heard of. The catalog's long tail is films with a dozen votes, and raw vector
 * neighbours are full of them.
 */
const RELATED_MIN_VOTES = 500;

/** Below this many survivors, the floor is costing more than it's buying. */
const RELATED_MIN_RESULTS = 6;

/**
 * "More like this" — the films nearest this one in meaning.
 *
 * Vectors rather than TMDB's own `/recommendations`: both are free, so quality
 * decided it. TMDB's list is behavioural ("people who watched this also
 * watched") and drifts — it answers *Scary Movie* with 21 Jump Street and Black
 * Dynamite, where the vectors answer with Scary Movie 2, Scream and Stan
 * Helsing. It also needs no OpenAI call, since the query is the film's own
 * stored vector.
 *
 * Over-fetching is deliberate and free (see `findSimilarMovieIds`): 100
 * candidates go to Postgres, where a popularity floor does the work Pinecone
 * can't, because the vector metadata carries no vote count. Roughly a third
 * survive for a mainstream film. An obscure one keeps almost nothing, so the
 * floor drops away entirely rather than returning a shelf of three.
 */
export async function getRelatedMovies(
  supabase: SupabaseClient<Database>,
  movieId: number,
  limit = 20,
): Promise<MovieCard[]> {
  const scores = await findSimilarMovieIds(movieId, 100);
  if (scores.size === 0) return [];

  const ids = [...scores.keys()];

  let rows = unwrap(
    await supabase
      .from("movies")
      .select(CARD_SELECT)
      .in("id", ids)
      .gte("vote_count", RELATED_MIN_VOTES),
    "Related films",
  );

  if (rows.length < RELATED_MIN_RESULTS) {
    // Second Postgres query, no second Pinecone read — the candidates are
    // already in hand.
    rows = unwrap(
      await supabase.from("movies").select(CARD_SELECT).in("id", ids),
      "Related films",
    );
  }

  // Postgres returns `in()` rows in arbitrary order; similarity is the whole
  // point of the list, so impose it here.
  return rows
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, limit);
}

/** The user's ratings keyed by movie, so cards can show current star state. */
export async function getRatingsByMovie(
  supabase: SupabaseClient<Database>,
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("user_movie_ratings")
    .select("movie_id, rating");

  if (error) throw new Error(`Failed to read ratings: ${error.message}`);

  const entries: [number, number][] = [];
  for (const row of data ?? []) {
    if (row.rating !== null) entries.push([row.movie_id, row.rating]);
  }
  return new Map(entries);
}

/**
 * `%` and `_` are wildcards in LIKE, so a query containing them would quietly
 * mean something other than what was typed.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type TitleSearch = {
  movies: MovieCard[];
  /** True when another page exists past the one returned. */
  hasMore: boolean;
};

/**
 * Title search, served by the trigram index on `movies.title`.
 *
 * Postgres, not vectors: at this size the question a search box gets asked is
 * "do you have this film", which is a lookup. Describing a film you can't name
 * is what the agent's semantic tool is for.
 *
 * Results come back by popularity, then get re-ranked into three tiers: an
 * exact title, then titles starting with the query, then titles merely
 * containing it. Popularity alone puts Her fifth behind Hereditary and
 * Hercules when you type "her", which is the wrong answer to an exact name.
 * Doing the re-rank in memory keeps this to one query and needs no database
 * function.
 *
 * `offset` pages the same ordering for the overlay's infinite scroll. The tier
 * re-rank applies within the returned window, which is what you want: the
 * window is a contiguous slice of one global popularity order, so paging never
 * repeats or skips a row, and the exact-title promotion still lands on the
 * first page where it matters.
 */
export async function searchMoviesByTitle(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 60,
  offset = 0,
): Promise<TitleSearch> {
  const term = query.trim();
  if (term.length < MIN_SEARCH_LENGTH) return { movies: [], hasMore: false };

  const pattern = `%${escapeLikePattern(term)}%`;

  // One row past the window is how we know another page exists without paying
  // for a count over 104k rows.
  const { data, error } = await supabase
    .from("movies")
    .select(CARD_SELECT)
    .ilike("title", pattern)
    .order("popularity", { ascending: false, nullsFirst: false })
    // Popularity ties are common and Postgres makes no promise about their
    // order between queries. Without a unique tiebreak, two overlapping
    // windows can hand back the same film twice and drop another entirely.
    .order("id", { ascending: true })
    .range(offset, offset + limit);

  if (error) throw new Error(`Search failed: ${error.message}`);

  const rows = withPoster(data ?? []);
  const hasMore = (data?.length ?? 0) > limit;

  const lower = term.toLowerCase();
  const exact: MovieCard[] = [];
  const startsWith: MovieCard[] = [];
  const contains: MovieCard[] = [];

  for (const row of rows) {
    const title = row.title.toLowerCase();
    if (title === lower) exact.push(row);
    else if (title.startsWith(lower)) startsWith.push(row);
    else contains.push(row);
  }

  // Each tier stays in popularity order, so two films sharing a title still
  // come back best-known first.
  return {
    movies: [...exact, ...startsWith, ...contains].slice(0, limit),
    hasMore,
  };
}

export type RatedMovie = {
  movie: MovieCard;
  rating: number;
  notes: string | null;
  ratedAt: string;
};

/**
 * Every film a user has scored, best first — a profile page's whole dataset,
 * owner's or not. One query: the ratings carry their movie rows with them
 * rather than being hydrated in a second pass.
 *
 * Ratings are publicly readable now, so `userId` is required rather than
 * left to RLS to narrow — an unfiltered query here would return everyone's.
 */
export async function getRatedMovies(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RatedMovie[]> {
  const { data, error } = await supabase
    .from("user_movie_ratings")
    .select(`rating, notes, created_at, movies(${CARD_SELECT})`)
    .eq("user_id", userId)
    .not("rating", "is", null)
    .order("rating", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to read rated films: ${error.message}`);

  const rated: RatedMovie[] = [];
  for (const row of data ?? []) {
    // A rating whose film left the catalog has nothing to render.
    if (!row.movies || row.rating === null) continue;
    rated.push({
      movie: row.movies,
      rating: row.rating,
      notes: row.notes,
      ratedAt: row.created_at,
    });
  }
  return rated;
}

export type BecauseYouRated = {
  seed: { title: string; rating: number };
  movies: MovieCard[];
};

/**
 * The one personalized row driven by vector search, seeded from the user's
 * highest-rated film. This is the only row that costs an embedding call, which
 * is why every other row is plain Postgres.
 *
 * Returns null when the user has no ratings yet — the caller omits the row
 * rather than showing an empty shelf.
 */
export async function getBecauseYouRated(
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<BecauseYouRated | null> {
  const { data: favorites, error } = await supabase
    .from("user_movie_ratings")
    .select("movie_id, rating, movies(title, overview, genres)")
    .not("rating", "is", null)
    .order("rating", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to read favorites: ${error.message}`);

  const favorite = favorites?.[0];
  if (!favorite?.movies || favorite.rating === null) return null;

  const seedText = [
    favorite.movies.title,
    favorite.movies.genres.join(", "),
    favorite.movies.overview,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  // Over-fetch so dropping the seed itself and already-rated films doesn't
  // leave a stubby row.
  const matches = await searchByMeaning(supabase, { query: seedText, limit: limit + 10 });
  const rated = await getRatingsByMovie(supabase);

  const keepIds = matches
    .map((match) => match.movie_id)
    .filter((id) => id !== favorite.movie_id && !rated.has(id))
    .slice(0, limit);

  if (keepIds.length === 0) return null;

  const cards = await hydrateCards(supabase, keepIds);
  // Preserve similarity order; Postgres returned these in arbitrary order.
  const ordered = keepIds
    .map((id) => cards.get(id))
    .filter((card): card is MovieCard => card !== undefined);

  return {
    seed: { title: favorite.movies.title, rating: favorite.rating },
    movies: withPoster(ordered),
  };
}

/**
 * Feature film for the hero: well-regarded, has a backdrop, and the user hasn't
 * rated it — a hero for something they've already seen wastes the slot.
 */
export async function getHeroMovie(
  supabase: SupabaseClient<Database>,
  excludeIds: number[] = [],
): Promise<MovieCard | null> {
  let query = supabase
    .from("movies")
    .select(CARD_SELECT)
    .not("backdrop_path", "is", null)
    .gte("vote_count", 400)
    .gte("vote_average", 7)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(1);

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Hero query failed: ${error.message}`);

  return data?.[0] ?? null;
}
