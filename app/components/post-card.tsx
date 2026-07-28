"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";

import {
  addComment,
  deleteComment,
  deletePost,
  loadComments,
  setLiked,
  setReposted,
} from "@/app/actions/posts";
import { Avatar } from "@/app/components/avatar";
import { PostMovies } from "@/app/components/post-movies";
import { useSignIn, useSignedIn } from "@/app/components/session";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import {
  MAX_COMMENT_LENGTH,
  relativeTime,
  type FeedEntry,
  type PostAuthor,
  type PostComment,
} from "@/lib/social/posts";

/**
 * A post, wherever it appears: the feed, a profile, its own permalink.
 *
 * Three counts and three buttons, and all three buttons move their number the
 * moment they're pressed. The server is asked afterwards and only heard from
 * when it says no, in which case the number goes back — the same posture the
 * stars and the watchlist heart already take, and for the same reason: the tap
 * is the event, and a spinner over a number you can already read denies what
 * just happened.
 *
 * Replies are the exception. They are fetched when the thread is opened rather
 * than shipped with the post, because most posts in a feed are scrolled past
 * and their replies would be most of the payload.
 */
export function PostCard({
  entry,
  viewerId,
  /** Supplied by the permalink, which arrives with the thread already open. */
  initialComments = null,
}: {
  entry: FeedEntry;
  viewerId: string | null;
  initialComments?: PostComment[] | null;
}) {
  const { post } = entry;
  const signedIn = useSignedIn();
  const signIn = useSignIn();

  const [liked, setLikedState] = useState(post.likedByViewer);
  const [likes, setLikes] = useState(post.likes);
  const [reposted, setRepostedState] = useState(post.repostedByViewer);
  const [reposts, setReposts] = useState(post.reposts);

  const [comments, setComments] = useState<PostComment[] | null>(initialComments);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [open, setOpen] = useState(initialComments !== null);
  const [loadingComments, setLoadingComments] = useState(false);

  const [removed, setRemoved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const isOwner = viewerId !== null && viewerId === post.author.id;

  function react(
    kind: "like" | "repost",
    on: boolean,
    apply: (value: boolean) => void,
    applyCount: (delta: number) => void,
  ) {
    if (!signedIn) {
      signIn(kind === "like" ? "To like this post" : "To repost this");
      return;
    }

    apply(on);
    applyCount(on ? 1 : -1);
    setError(null);

    startTransition(async () => {
      const result =
        kind === "like" ? await setLiked(post.id, on) : await setReposted(post.id, on);
      if (!result.ok) {
        apply(!on);
        applyCount(on ? -1 : 1);
        setError(result.error);
      }
    });
  }

  async function toggleThread() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    // Fetched once per mount. Replies added or removed afterwards are applied
    // to the list in hand, so re-opening never costs a second round trip.
    if (comments !== null) return;

    setLoadingComments(true);
    const result = await loadComments(post.id);
    setLoadingComments(false);

    if (result.ok) setComments(result.comments);
    else setError(result.error);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.ok) setRemoved(true);
      else {
        setConfirmingDelete(false);
        setError(result.error);
      }
    });
  }

  // Gone from the page the moment the server agrees, rather than lingering
  // until a revalidation reaches whatever list this is sitting in.
  if (removed) return null;

  return (
    <article className="border-b border-ink-line py-5">
      {entry.repostedBy && <RepostLine by={entry.repostedBy} viewerId={viewerId} />}

      <div className="flex gap-3.5">
        <Link href={`/${post.author.username}`} className="shrink-0">
          <Avatar
            url={avatarUrl(post.author.avatar_path)}
            initials={initialsFor(post.author.display_name, post.author.username)}
            size={44}
          />
        </Link>

        <div className="min-w-0 flex-1">
          <header className="flex items-baseline gap-x-2">
            <Link
              href={`/${post.author.username}`}
              className="truncate font-semibold text-bone transition-colors hover:text-lamp"
            >
              {displayNameFor(post.author.display_name, post.author.username)}
            </Link>
            <span className="meta truncate !text-xs">@{post.author.username}</span>
            <span aria-hidden className="text-bone-dim/60">
              ·
            </span>
            {/* The permalink lives on the timestamp, which is where a reader
                already knows to look for one. */}
            <Link href={`/post/${post.id}`} className="meta !text-xs hover:text-lamp">
              <TimeAgo iso={post.createdAt} />
            </Link>

            {isOwner && (
              <span className="ml-auto shrink-0">
                <DeleteControl
                  confirming={confirmingDelete}
                  onAsk={() => setConfirmingDelete(true)}
                  onCancel={() => setConfirmingDelete(false)}
                  onConfirm={remove}
                />
              </span>
            )}
          </header>

          {/* pre-wrap because a post is typed, not authored — the line breaks
              someone put in are part of what they wrote. No markdown: this is
              a paragraph about a film, not a document. */}
          <p className="mt-1.5 leading-relaxed break-words whitespace-pre-wrap text-bone">
            {post.body}
          </p>

          <PostMovies movies={post.movies} />

          <div className="mt-3 flex items-center gap-1">
            <ActionButton
              // One glyph in both states; the fill is what changes, the same
              // way the favorite heart on a poster works.
              icon="lucide:heart"
              filled={liked}
              count={likes}
              label={liked ? "Unlike" : "Like"}
              tone="text-ember"
              onClick={() =>
                react("like", !liked, setLikedState, (delta) =>
                  setLikes((current) => current + delta),
                )
              }
            />

            <ActionButton
              icon="lucide:message-circle"
              filled={false}
              count={commentCount}
              label={open ? "Hide replies" : "Replies"}
              tone="text-lamp"
              expanded={open}
              onClick={toggleThread}
            />

            <ActionButton
              icon="lucide:repeat-2"
              filled={reposted}
              count={reposts}
              label={reposted ? "Undo repost" : "Repost"}
              tone="text-lamp"
              onClick={() =>
                react("repost", !reposted, setRepostedState, (delta) =>
                  setReposts((current) => current + delta),
                )
              }
            />
          </div>

          {error && (
            <p role="alert" className="meta mt-2 !text-lamp">
              {error}
            </p>
          )}

          {open && (
            <Thread
              postId={post.id}
              comments={comments}
              loading={loadingComments}
              onAdded={(comment) => {
                setComments((current) => [...(current ?? []), comment]);
                setCommentCount((current) => current + 1);
              }}
              onRemoved={(commentId) => {
                setComments((current) =>
                  (current ?? []).filter((entry) => entry.id !== commentId),
                );
                setCommentCount((current) => Math.max(0, current - 1));
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

/** "You reposted" / "Ada reposted", above the post it put back in front of you. */
function RepostLine({ by, viewerId }: { by: PostAuthor; viewerId: string | null }) {
  return (
    <p className="meta mb-2 flex items-center gap-2 pl-[3.75rem] !text-xs">
      <Icon icon="lucide:repeat-2" width={14} height={14} aria-hidden />
      {viewerId === by.id ? (
        "You reposted"
      ) : (
        <>
          <Link href={`/${by.username}`} className="hover:text-lamp">
            {displayNameFor(by.display_name, by.username)}
          </Link>
          <span>reposted</span>
        </>
      )}
    </p>
  );
}

/**
 * One clock for every timestamp on the page.
 *
 * A post says "now" for a minute and "12m" for an hour, so a label drawn once
 * is wrong within a minute — but an interval per card would mean forty timers
 * on a feed, all firing to ask the same question. This is one, started by the
 * first `TimeAgo` to mount and stopped by the last to leave.
 */
const tickListeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function subscribeToTick(onTick: () => void) {
  tickListeners.add(onTick);
  ticker ??= setInterval(() => {
    for (const listener of tickListeners) listener();
  }, 30_000);

  return () => {
    tickListeners.delete(onTick);
    if (tickListeners.size === 0) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

/**
 * The age of a post, in the reader's own terms.
 *
 * `useSyncExternalStore` rather than state set in an effect, because the
 * server has no business computing this at all: "3h" depends on the clock
 * reading it, and a server that rendered "2h" a second earlier would hand
 * React a string the browser disagrees with. The third argument is the server
 * snapshot — null, so the markup is complete before the label arrives, and
 * hydration compares null against null. The `datetime` attribute carries the
 * real instant the whole time.
 */
function TimeAgo({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    subscribeToTick,
    () => relativeTime(iso),
    () => null,
  );

  return <time dateTime={iso}>{label}</time>;
}

/**
 * One of the three counts under a post.
 *
 * The glyph fills rather than the button changing colour wholesale, the same
 * way the watchlist and favorite buttons work on a poster — at this size the
 * fill reads before the shape does.
 */
function ActionButton({
  icon,
  filled,
  count,
  label,
  tone,
  expanded,
  onClick,
}: {
  icon: string;
  filled: boolean;
  count: number;
  label: string;
  /** The colour this control takes when it is on. */
  tone: string;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={expanded === undefined ? filled : undefined}
      aria-expanded={expanded}
      className={`group flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-sm transition-colors ${
        filled ? tone : "text-bone-dim hover:text-bone"
      }`}
    >
      <Icon
        icon={icon}
        width={17}
        height={17}
        aria-hidden
        className={`pointer-events-none ${filled ? "[&_*]:fill-current" : ""}`}
      />
      <span className="tabular-nums">{count > 0 ? count : ""}</span>
    </button>
  );
}

/**
 * Delete, in two presses.
 *
 * No browser confirm(): nothing else in the app opens one, and a native dialog
 * over this palette reads as a different program. The button asks its own
 * question instead, and clicking anything else is how you say no.
 */
function DeleteControl({
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        aria-label="Delete this post"
        className="grid size-8 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
      >
        <Icon icon="lucide:trash-2" width={15} height={15} aria-hidden />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full px-2.5 py-1 text-xs font-semibold text-ember transition-colors hover:bg-ember/15"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full px-2.5 py-1 text-xs font-semibold text-bone-dim transition-colors hover:text-bone"
      >
        Cancel
      </button>
    </span>
  );
}

/** The replies under an opened post, and the box for adding one. */
function Thread({
  postId,
  comments,
  loading,
  onAdded,
  onRemoved,
}: {
  postId: string;
  comments: PostComment[] | null;
  loading: boolean;
  onAdded: (comment: PostComment) => void;
  onRemoved: (commentId: string) => void;
}) {
  return (
    <section className="mt-3 border-l-2 border-ink-line pl-4">
      {loading && comments === null ? (
        <p className="meta py-2">Loading replies…</p>
      ) : (
        <>
          {comments && comments.length > 0 && (
            <ul className="flex flex-col gap-3.5 pb-1">
              {comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} onRemoved={onRemoved} />
              ))}
            </ul>
          )}

          <CommentComposer postId={postId} onAdded={onAdded} />
        </>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  onRemoved,
}: {
  comment: PostComment;
  onRemoved: (commentId: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    // Removed from the list first: the reply is the reader's own, and putting
    // it back on failure is a smaller surprise than watching it sit there.
    onRemoved(comment.id);
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="group/comment flex gap-2.5">
      <Link href={`/${comment.author.username}`} className="shrink-0 pt-0.5">
        <Avatar
          url={avatarUrl(comment.author.avatar_path)}
          initials={initialsFor(comment.author.display_name, comment.author.username)}
          size={28}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-x-2">
          <Link
            href={`/${comment.author.username}`}
            className="truncate text-sm font-semibold text-bone transition-colors hover:text-lamp"
          >
            {displayNameFor(comment.author.display_name, comment.author.username)}
          </Link>
          <span className="meta !text-xs">
            <TimeAgo iso={comment.createdAt} />
          </span>

          {comment.deletableByViewer && (
            <button
              type="button"
              onClick={remove}
              aria-label="Delete this reply"
              // Revealed on hover on a pointer device, and always present to a
              // keyboard — focus-within is what keeps it reachable by tab.
              className="ml-auto shrink-0 text-bone-dim opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100"
            >
              <Icon icon="lucide:x" width={14} height={14} aria-hidden />
            </button>
          )}
        </p>

        <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-bone-soft">
          {comment.body}
        </p>

        {error && (
          <p role="alert" className="meta mt-1 !text-lamp">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

function CommentComposer({
  postId,
  onAdded,
}: {
  postId: string;
  onAdded: (comment: PostComment) => void;
}) {
  const signedIn = useSignedIn();
  const signIn = useSignIn();

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={() => signIn("To reply to this post")}
        className="meta py-2 transition-colors hover:text-lamp"
      >
        Sign in to reply
      </button>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await addComment(postId, text);
      if (result.ok) {
        onAdded(result.comment);
        setBody("");
        // Straight back to the box: replying once usually means replying again.
        inputRef.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-1">
      <input
        ref={inputRef}
        type="text"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Reply…"
        aria-label="Write a reply"
        className="h-9 min-w-0 flex-1 rounded-full border border-ink-line bg-bone/8 px-3.5 text-sm text-bone transition-colors placeholder:text-bone-dim focus:border-lamp focus:outline-none"
      />
      <button
        type="submit"
        disabled={body.trim().length === 0 || pending}
        className="btn btn-quiet h-9 px-3.5 text-xs"
      >
        {pending ? "Sending…" : "Reply"}
      </button>

      {error && (
        <p role="alert" className="meta !text-lamp">
          {error}
        </p>
      )}
    </form>
  );
}
