import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { findSimilarMovieIds } from "@/lib/movies/search";
import type { FeedEntry } from "@/lib/social/posts";

/**
 * Ordering the feed, without spending anything to do it.
 *
 * The rule this is built under: a feed render must not cost a model call. Every
 * signal below is either already in Postgres or already paid for.
 *
 *   follows        one indexed read the page needs anyway
 *   ratings        the viewer's own rows, projected down to ids and genres
 *   film adjacency ONE Pinecone query, by stored vector id
 *   engagement     aggregates that came back with the posts
 *   recency        arithmetic
 *
 * The film-adjacency signal is the interesting one, and it is the answer to
 * "can we use the movies' existing embeddings". We can, for free: the vectors
 * were paid for at sync time, and `findSimilarMovieIds` queries Pinecone *by
 * vector id* rather than by text, so there is no embedding call — the same
 * trick `getRelatedMovies` uses for the "More like this" shelf. One query, one
 * read unit, whatever the viewer's history looks like. What comes back is a
 * hundred films adjacent to their favourite, and a post about any of them is a
 * post about something near their taste even if they've never rated it.
 *
 * Scoring itself is a pure function over rows already in memory, in the spirit
 * of `lib/profiles/stats.ts` — nothing here asks Postgres a second question.
 */

/** A rating at or above this is an endorsement; the column runs 1-10. */
const LOVED_RATING = 7;

/** Neighbours to pull for the adjacency signal. topK is free, so take the lot. */
const NEIGHBOURS = 100;

export type FeedAffinity = {
  viewerId: string | null;
  following: Set<string>;
  /** Films the viewer rated highly. A post about one of these is about them. */
  loved: Set<number>;
  /** Films near their favourite, weighted 1 → 0 by rank among the neighbours. */
  nearby: Map<number, number>;
  /** Genres of their loved films, weighted 1 → 0 against the commonest one. */
  genres: Map<string, number>;
};

/**
 * What a signed-out visitor gets. Ranking still works — it degrades to recency
 * and engagement, which is the right answer when nothing is known about who is
 * reading.
 */
export const EMPTY_AFFINITY: FeedAffinity = {
  viewerId: null,
  following: new Set(),
  loved: new Set(),
  nearby: new Map(),
  genres: new Map(),
};

/**
 * Everything the ranker knows about the viewer, gathered once per feed render.
 *
 * `followingIds` is passed in rather than read here because the page already
 * has it — the "who to follow" rail needs the same list.
 */
export async function getFeedAffinity(
  supabase: SupabaseClient<Database>,
  viewerId: string | null,
  followingIds: string[],
): Promise<FeedAffinity> {
  if (!viewerId) return EMPTY_AFFINITY;

  // Deliberately not `getRatedMovies`: that projection carries posters,
  // taglines and synopses for the profile grid, and ranking needs an id, a
  // score and a genre list. Best-first, so the first row is the seed.
  const { data, error } = await supabase
    .from("user_movie_ratings")
    .select("movie_id, rating, movies(genres)")
    .eq("user_id", viewerId)
    .not("rating", "is", null)
    .order("rating", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to read taste for the feed: ${error.message}`);

  const loved = new Set<number>();
  const genreCounts = new Map<string, number>();

  for (const row of data ?? []) {
    if (row.rating === null || row.rating < LOVED_RATING) continue;
    loved.add(row.movie_id);
    for (const genre of row.movies?.genres ?? []) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  // Normalized against the viewer's own commonest genre rather than a fixed
  // number, so someone with six ratings and someone with six hundred both get
  // a signal that runs across the same range.
  const busiest = Math.max(...genreCounts.values(), 1);
  const genres = new Map(
    [...genreCounts].map(([genre, count]) => [genre, count / busiest] as const),
  );

  return {
    viewerId,
    following: new Set(followingIds),
    loved,
    genres,
    nearby: await nearbyFilms(data?.[0]?.movie_id ?? null),
  };
}

/**
 * Films adjacent to the viewer's favourite, weighted by rank.
 *
 * Rank rather than raw cosine: similarity scores from an embedding model sit in
 * a narrow band near the top (an unrelated pair is ~0.7, a close pair ~0.85),
 * so using them directly would need a floor and a scale tuned to whichever
 * model produced the vectors. Position in the neighbour list says the same
 * thing and survives a change of model.
 *
 * A failure here is not a failure of the feed. Pinecone being unreachable costs
 * one of five signals, and the other four still order the page — so this logs
 * and returns nothing rather than throwing.
 */
async function nearbyFilms(seedMovieId: number | null): Promise<Map<number, number>> {
  if (seedMovieId === null) return new Map();

  try {
    const scores = await findSimilarMovieIds(seedMovieId, NEIGHBOURS);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    return new Map(
      ranked.map(([movieId], index) => [movieId, 1 - index / ranked.length] as const),
    );
  } catch (error) {
    console.error("[getFeedAffinity] neighbours", error);
    return new Map();
  }
}

/*
 * The weights.
 *
 * Read them as "how many hours of freshness is this worth". The decay below
 * halves a score every HALF_LIFE_HOURS, and the base score is 1, so a boost of
 * 1 keeps a post competitive with something half a day newer. They are laid
 * out in the order they matter: who wrote it beats what it's about, and what
 * it's about beats how many people have already clapped.
 */

/** Someone you chose to follow. The strongest signal there is, because you set it. */
const FOLLOWED_AUTHOR = 1.4;

/** A post about a film you rated highly — the film itself, not one like it. */
const LOVED_FILM = 0.9;

/** A post about a film near your favourite in vector space, at its best rank. */
const NEARBY_FILM = 0.8;

/** A post about a genre you keep returning to. Broad, so weighted lightly. */
const GENRE = 0.35;

/**
 * Engagement, through a log: the difference between 0 and 5 likes says
 * something, the difference between 200 and 400 says almost nothing, and a
 * linear term would let one popular post outrank everything you follow.
 */
const ENGAGEMENT = 0.28;

/** Comments and reposts cost more to leave than a like, so they count for more. */
const COMMENT_WEIGHT = 2;
const REPOST_WEIGHT = 1.5;

/** Your own post, so you can see it landed. Small — this is not a mirror. */
const OWN_POST = 0.5;

/**
 * How fast a post falls out of the feed.
 *
 * Eighteen hours means yesterday evening's posts are still around this morning
 * and last week's are effectively gone, which is what "what's happening" means
 * on a site where a few hundred people post about films.
 */
const HALF_LIFE_HOURS = 18;

const HOUR_MS = 3_600_000;

/**
 * One entry's score. Additive signals, multiplied by decay.
 *
 * Multiplied rather than added so that age discounts the *whole* case for a
 * post: an old post from someone you follow about a film you love should sink,
 * and with an additive decay term it never would.
 */
function scoreEntry(entry: FeedEntry, affinity: FeedAffinity, now: number): number {
  const { post } = entry;
  let score = 1;

  // A repost only reaches the feed because a followed account made it, so the
  // reposter is the account being credited here, not the original author.
  if (entry.repostedBy) {
    score += FOLLOWED_AUTHOR;
  } else if (affinity.following.has(post.author.id)) {
    score += FOLLOWED_AUTHOR;
  }

  if (affinity.viewerId && post.author.id === affinity.viewerId) score += OWN_POST;

  // The best film on the post rather than the sum of them: a double bill where
  // one half is a favourite is as relevant as one where both are, and summing
  // would make attaching four films a way to outrank everyone.
  let loved = 0;
  let nearby = 0;
  let genre = 0;

  for (const movie of post.movies) {
    if (affinity.loved.has(movie.id)) loved = 1;
    nearby = Math.max(nearby, affinity.nearby.get(movie.id) ?? 0);
    for (const name of movie.genres) {
      genre = Math.max(genre, affinity.genres.get(name) ?? 0);
    }
  }

  score += loved * LOVED_FILM + nearby * NEARBY_FILM + genre * GENRE;

  const engagement =
    post.likes + post.comments * COMMENT_WEIGHT + post.reposts * REPOST_WEIGHT;
  score += Math.log1p(engagement) * ENGAGEMENT;

  const ageHours = Math.max(0, (now - new Date(entry.at).getTime()) / HOUR_MS);
  return score * Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

/**
 * The feed, in order.
 *
 * Deduplication happens after sorting rather than before: a post can be in the
 * pool twice — once as itself, once as a repost by someone you follow — and
 * which of the two to keep is exactly the question the scores just answered.
 * Keeping the higher one means a repost wins when the reposter is the reason
 * you're seeing it, and loses when you already follow the author.
 */
export function rankFeed(
  entries: FeedEntry[],
  affinity: FeedAffinity,
  { limit = 40, now = Date.now() }: { limit?: number; now?: number } = {},
): FeedEntry[] {
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, affinity, now) }))
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const feed: FeedEntry[] = [];

  for (const { entry } of scored) {
    if (seen.has(entry.post.id)) continue;
    seen.add(entry.post.id);
    feed.push(entry);
    if (feed.length >= limit) break;
  }

  return feed;
}
