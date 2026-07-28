/**
 * The shapes a post takes, and the limits it lives inside.
 *
 * Pure, and safe to import from a client component — same rule as
 * `lib/movies/images.ts` and `lib/movies/search-config.ts`. The composer needs
 * the character limit to draw its counter, and the card needs these types to
 * render, so neither may drag `queries.ts` (and through it Postgres, Pinecone
 * and OpenAI) into the browser bundle.
 *
 * The database is the authority on the two lengths — `posts_body_length` and
 * `post_comments_body_length` are the checks that actually hold — and these
 * mirror them so the form can say the same thing before it submits.
 */

import type { MovieCard } from "@/lib/movies/images";

export const MAX_POST_LENGTH = 1000;
export const MAX_COMMENT_LENGTH = 500;

/**
 * Films per post. Not a database constraint: counting rows in a sibling table
 * needs a trigger, and the cost of getting this wrong is a wide card rather
 * than corrupt data. The Server Function enforces it, which is the boundary
 * that matters — a hand-rolled POST is checked there, not in the browser.
 *
 * Four because that's what fits as one row of posters at a phone's width.
 */
export const MAX_POST_MOVIES = 4;

/** Who wrote it. The same four columns `FollowProfile` carries, for the same reason. */
export type PostAuthor = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
};

export type Post = {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
  /** In the order the author attached them. Empty for a post about nothing in particular. */
  movies: MovieCard[];
  likes: number;
  comments: number;
  reposts: number;
  /** Both false for a signed-out visitor — there is no viewer to have acted. */
  likedByViewer: boolean;
  repostedByViewer: boolean;
};

export type PostComment = {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
  /** Whether the viewer may remove it: they wrote it, or they own the post. */
  deletableByViewer: boolean;
};

/**
 * One row of a feed.
 *
 * A post can reach you two ways — its author wrote it, or someone you follow
 * put it back in front of you — and the difference is worth showing, so the
 * entry wraps the post rather than the feed being a list of posts. `at` is
 * whichever of the two events this entry represents, which is what recency
 * scores against: a two-week-old post reposted this morning is this morning's
 * news to the person who just saw it.
 */
export type FeedEntry = {
  /** Unique within one feed: the same post can appear as itself and as a repost. */
  key: string;
  post: Post;
  repostedBy: PostAuthor | null;
  at: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Beyond a week, "9d" stops meaning anything and a date means more. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATE_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * "now", "12m", "5h", "3d", "Jul 12" — the timestamp beside a name.
 *
 * Rendered on the client so it reads against the reader's own clock, which
 * means it must never be produced during the server render: the two would
 * disagree by however long the response took and React would call it a
 * hydration mismatch. The card holds the ISO string and formats it in an
 * effect; this is the function it calls.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const elapsed = now - then;

  // A clock skewed a few seconds ahead of the server shouldn't read "-1m".
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;

  const date = new Date(then);
  return date.getFullYear() === new Date(now).getFullYear()
    ? DATE_FORMAT.format(date)
    : DATE_WITH_YEAR.format(date);
}

/** The reason a post won't do, or null when it will. Phrased for a composer. */
export function postProblem(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return "Write something first.";
  if (trimmed.length > MAX_POST_LENGTH) {
    return `Keep it to ${MAX_POST_LENGTH} characters or fewer.`;
  }
  return null;
}

/** The same, for a reply. Separate because the limit and the wording differ. */
export function commentProblem(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return "Write something first.";
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return `Keep it to ${MAX_COMMENT_LENGTH} characters or fewer.`;
  }
  return null;
}
