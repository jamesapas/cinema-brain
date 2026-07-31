import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { MovieCard } from "@/lib/movies/images";
import type { FeedEntry, Post, PostAuthor, PostComment } from "@/lib/social/posts";

/**
 * Reads for the feed, the permalink, and the posts section of a profile.
 *
 * Three facts shape everything here:
 *
 * 1. `posts.author_id` points at `auth.users`, not `profiles`, so PostgREST has
 *    no foreign key to embed across and cannot hand back the author with the
 *    post. Every read is therefore two steps — the rows, then the profiles they
 *    name — exactly as `lib/profiles/follows.ts` already does for follow edges.
 *
 * 2. Counts come back as embedded aggregates (`post_likes(count)`) rather than
 *    from stored counters. See the migration for why there are no counters.
 *
 * 3. Whether *you* liked something is a different question from how many people
 *    did, and it is asked once for the whole page rather than once per card.
 */

// Kept in step with catalog's CARD_SELECT by hand, for the reason spelled out
// in lib/movies/lists.ts: importing catalog.ts drags Pinecone and the OpenAI
// client along with it, and a post's attached films need none of that.
const CARD_SELECT =
  "id, title, tagline, release_year, genres, runtime, vote_average, vote_count, overview, poster_path, backdrop_path";

const POST_SELECT = `id, author_id, body, created_at, post_movies(position, movies(${CARD_SELECT})), post_likes(count), post_comments(count), post_reposts(count)`;

/**
 * How many recent posts the ranker gets to choose from.
 *
 * The feed shows a fraction of this. Over-fetching is what lets ranking do
 * anything at all — score 30 rows and the answer is 30 rows in a different
 * order — and the cost is one indexed range scan over `posts_recent_idx`,
 * which is the same scan either way.
 */
export const FEED_CANDIDATES = 150;

/** Reposts are only pulled from people the viewer follows; this caps that side. */
const REPOST_CANDIDATES = 60;

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  post_movies: { position: number; movies: MovieCard | null }[];
  post_likes: { count: number }[];
  post_comments: { count: number }[];
  post_reposts: { count: number }[];
};

/** Aggregates arrive as a one-element array, or as nothing when the count is zero. */
function countOf(rows: { count: number }[] | null): number {
  return rows?.[0]?.count ?? 0;
}

/**
 * Profiles for a set of author ids.
 *
 * The map-shaped twin of `profilesInOrder` in lib/profiles/follows.ts. Kept
 * separate rather than shared because that one answers "these ids, in this
 * order" for a list page, and this one answers "look up whoever wrote this"
 * for rows that already have their own order.
 */
async function authorsByIds(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, PostAuthor>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path")
    .in("id", ids);

  if (error) throw new Error(`Failed to read post authors: ${error.message}`);
  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

/**
 * Which of these posts the viewer has already liked or reposted.
 *
 * Two queries for the whole page rather than two per card. Signed out there is
 * nothing to ask, so nothing is asked.
 */
async function viewerActions(
  supabase: SupabaseClient<Database>,
  viewerId: string | null,
  postIds: string[],
): Promise<{ liked: Set<string>; reposted: Set<string> }> {
  if (!viewerId || postIds.length === 0) {
    return { liked: new Set(), reposted: new Set() };
  }

  const [likes, reposts] = await Promise.all([
    supabase.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    supabase.from("post_reposts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
  ]);

  if (likes.error) throw new Error(`Failed to read likes: ${likes.error.message}`);
  if (reposts.error) throw new Error(`Failed to read reposts: ${reposts.error.message}`);

  return {
    liked: new Set((likes.data ?? []).map((row) => row.post_id)),
    reposted: new Set((reposts.data ?? []).map((row) => row.post_id)),
  };
}

/**
 * One row plus the things that had to be fetched around it, as a `Post`.
 *
 * A post whose author's profile is missing is dropped by the callers rather
 * than rendered anonymously — there is no such thing as a post by nobody, and
 * the only way to get one is a row mid-cascade as an account is deleted.
 */
function toPost(
  row: PostRow,
  author: PostAuthor,
  liked: Set<string>,
  reposted: Set<string>,
): Post {
  const movies = [...row.post_movies]
    // Postgres has no row order to inherit, so the author's own order is a
    // column and imposing it is this line.
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.movies)
    // A film that left the catalog takes its card with it; the post survives.
    .filter((movie): movie is MovieCard => movie !== null);

  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author,
    movies,
    likes: countOf(row.post_likes),
    comments: countOf(row.post_comments),
    reposts: countOf(row.post_reposts),
    likedByViewer: liked.has(row.id),
    repostedByViewer: reposted.has(row.id),
  };
}

/** Rows to posts: one profiles query and one viewer-state pair for the lot. */
async function hydratePosts(
  supabase: SupabaseClient<Database>,
  rows: PostRow[],
  viewerId: string | null,
): Promise<Map<string, Post>> {
  if (rows.length === 0) return new Map();

  const [authors, actions] = await Promise.all([
    authorsByIds(supabase, [...new Set(rows.map((row) => row.author_id))]),
    viewerActions(supabase, viewerId, [...new Set(rows.map((row) => row.id))]),
  ]);

  const posts = new Map<string, Post>();
  for (const row of rows) {
    const author = authors.get(row.author_id);
    if (!author) continue;
    posts.set(row.id, toPost(row, author, actions.liked, actions.reposted));
  }
  return posts;
}

/**
 * The pool the ranker sorts: recent posts from everyone, plus recent reposts
 * from the people the viewer follows.
 *
 * Reposts are drawn only from the follow graph on purpose. A repost is an
 * endorsement, and an endorsement is worth surfacing when it comes from someone
 * whose taste you already asked for — a stranger's repost of a stranger's post
 * is just the post, which the first half of this already fetched.
 *
 * Both halves are one indexed read. Nothing here is personalized beyond that
 * list of ids, which is what keeps the query the same shape for every viewer.
 */
export async function getFeedCandidates(
  supabase: SupabaseClient<Database>,
  {
    viewerId,
    followingIds,
  }: { viewerId: string | null; followingIds: string[] },
): Promise<FeedEntry[]> {
  const [posts, reposts] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_SELECT)
      .order("created_at", { ascending: false })
      .limit(FEED_CANDIDATES),
    followingIds.length > 0
      ? supabase
          .from("post_reposts")
          .select(`user_id, created_at, posts(${POST_SELECT})`)
          .in("user_id", followingIds)
          .order("created_at", { ascending: false })
          .limit(REPOST_CANDIDATES)
      : null,
  ]);

  if (posts.error) throw new Error(`Failed to read the feed: ${posts.error.message}`);
  if (reposts?.error) throw new Error(`Failed to read reposts: ${reposts.error.message}`);

  const repostRows = (reposts?.data ?? []).filter(
    (row): row is typeof row & { posts: PostRow } => row.posts !== null,
  );

  // One hydration pass over both halves, so a post that was reposted doesn't
  // fetch its author twice.
  const rows = [...(posts.data ?? []), ...repostRows.map((row) => row.posts)];
  const byId = await hydratePosts(supabase, rows, viewerId);

  // The reposters themselves are profiles too, and they are not necessarily
  // among the authors already fetched.
  const reposters = await authorsByIds(
    supabase,
    [...new Set(repostRows.map((row) => row.user_id))],
  );

  const entries: FeedEntry[] = [];

  for (const row of posts.data ?? []) {
    const post = byId.get(row.id);
    if (post) entries.push({ key: post.id, post, repostedBy: null, at: post.createdAt });
  }

  for (const row of repostRows) {
    const post = byId.get(row.posts.id);
    const by = reposters.get(row.user_id);
    // Your own repost is not news to you, and it would sit above the post you
    // already saw when you wrote it.
    if (!post || !by || by.id === post.author.id) continue;
    entries.push({
      key: `${by.id}:${post.id}`,
      post,
      repostedBy: by,
      // The repost's own moment: this entry is as recent as the act that made it.
      at: row.created_at,
    });
  }

  return entries;
}

/**
 * One person's posts and reposts, newest first — the profile page's section.
 *
 * Their reposts are here for the same reason they're in the feed: putting
 * someone else's post in front of your followers is something you did, and a
 * profile that hid it would be an incomplete account of what they've said.
 */
export async function getUserEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
  viewerId: string | null,
  limit = 50,
): Promise<FeedEntry[]> {
  const [posts, reposts] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("post_reposts")
      .select(`user_id, created_at, posts(${POST_SELECT})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (posts.error) throw new Error(`Failed to read posts: ${posts.error.message}`);
  if (reposts.error) throw new Error(`Failed to read reposts: ${reposts.error.message}`);

  const repostRows = (reposts.data ?? []).filter(
    (row): row is typeof row & { posts: PostRow } => row.posts !== null,
  );

  const rows = [...(posts.data ?? []), ...repostRows.map((row) => row.posts)];
  const byId = await hydratePosts(supabase, rows, viewerId);

  const owner = (await authorsByIds(supabase, [userId])).get(userId) ?? null;

  const entries: FeedEntry[] = [];

  for (const row of posts.data ?? []) {
    const post = byId.get(row.id);
    if (post) entries.push({ key: post.id, post, repostedBy: null, at: post.createdAt });
  }

  for (const row of repostRows) {
    const post = byId.get(row.posts.id);
    // Reposting your own post says nothing on your own page.
    if (!post || !owner || post.author.id === userId) continue;
    entries.push({
      key: `${userId}:${post.id}`,
      post,
      repostedBy: owner,
      at: row.created_at,
    });
  }

  return entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** One post, for its permalink. Null when the id doesn't exist. */
export async function getPost(
  supabase: SupabaseClient<Database>,
  postId: string,
  viewerId: string | null,
): Promise<Post | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read post: ${error.message}`);
  if (!data) return null;

  return (await hydratePosts(supabase, [data], viewerId)).get(data.id) ?? null;
}

const COMMENT_SELECT = `id, author_id, body, created_at, post_comment_movies(position, movies(${CARD_SELECT}))`;

/**
 * A post's replies, oldest first — the order a conversation happened in.
 *
 * `postAuthorId` decides the delete affordance alongside the comment's own
 * author, matching the RLS policy: a post's owner can clear a reply under it.
 * The policy is the boundary; this is what stops the app offering a button
 * that would only be refused.
 */
export async function getComments(
  supabase: SupabaseClient<Database>,
  postId: string,
  viewerId: string | null,
  postAuthorId: string,
): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from("post_comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to read comments: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    post_comment_movies: { position: number; movies: MovieCard | null }[];
  }[];

  const authors = await authorsByIds(supabase, [...new Set(rows.map((row) => row.author_id))]);

  const comments: PostComment[] = [];
  for (const row of rows) {
    const author = authors.get(row.author_id);
    if (!author) continue;

    const movies = [...(row.post_comment_movies ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.movies)
      .filter((movie): movie is MovieCard => movie !== null);

    comments.push({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author,
      movies,
      deletableByViewer:
        viewerId !== null && (viewerId === row.author_id || viewerId === postAuthorId),
    });
  }
  return comments;
}
