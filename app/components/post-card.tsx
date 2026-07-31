"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import {
  addComment,
  deleteComment,
  deletePost,
  loadComments,
  setLiked,
  setReposted,
} from "@/app/actions/posts";
import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import { PostMovies } from "@/app/components/post-movies";
import { useSignIn, useSignedIn, useSessionUser } from "@/app/components/session";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import {
  MAX_COMMENT_LENGTH,
  relativeTime,
  type FeedEntry,
  type Post,
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
  followingIds = [],
  /** Supplied by the permalink, which arrives with the thread already open. */
  initialComments = null,
}: {
  entry: FeedEntry;
  viewerId: string | null;
  followingIds?: string[];
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
  const [visibleCount, setVisibleCount] = useState(1);
  const loadingComments = commentCount > 0 && comments === null;

  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const isOwner = viewerId !== null && viewerId === post.author.id;
  const isFollowing = followingIds.includes(post.author.id);

  useEffect(() => {
    if (commentCount > 0 && comments === null) {
      let active = true;
      loadComments(post.id).then((result) => {
        if (active && result.ok) setComments(result.comments);
      });
      return () => {
        active = false;
      };
    }
  }, [commentCount, comments, post.id]);

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

  function handleLoadMore() {
    setVisibleCount((prev) => prev + 5);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.ok) setRemoved(true);
      else {
        setError(result.error);
      }
    });
  }

  const pathname = usePathname();
  const router = useRouter();
  const isSinglePostPage = pathname === `/post/${post.id}`;

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (isSinglePostPage || event.defaultPrevented) return;

    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, form, label, [role='button'], .comments-section")) return;

    if (event.metaKey || event.ctrlKey) {
      window.open(`/post/${post.id}`, "_blank");
    } else {
      router.push(`/post/${post.id}`);
    }
  }

  if (removed) return null;

  const shownComments = comments ? comments.slice(0, visibleCount) : [];

  return (
    <article
      onClick={handleCardClick}
      className={`border-b border-ink-line py-5 ${!isSinglePostPage ? "cursor-pointer" : ""}`}
    >
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
          <header className="flex items-center gap-x-1.5 flex-wrap min-w-0">
            <Link
              href={`/${post.author.username}`}
              className="truncate font-semibold text-bone hover:underline"
            >
              {displayNameFor(post.author.display_name, post.author.username)}
            </Link>
            <Link href={`/${post.author.username}`} className="meta truncate !text-xs text-bone-dim hover:underline">
              @{post.author.username}
            </Link>
            <span aria-hidden className="text-bone-dim/40 text-xs">
              ·
            </span>
            <Link href={`/post/${post.id}`} className="meta !text-xs hover:text-bone">
              <TimeAgo iso={post.createdAt} />
            </Link>

            {!isOwner && (
              <>
                <span aria-hidden className="text-bone-dim/40 text-xs">
                  ·
                </span>
                <FollowButton
                  targetId={post.author.id}
                  targetUsername={post.author.username}
                  initialFollowing={isFollowing}
                  className={(active) =>
                    `text-xs font-semibold transition-colors cursor-pointer bg-transparent border-none p-0 h-auto ${
                      active ? "text-bone-dim hover:text-bone" : "text-lamp hover:underline"
                    }`
                  }
                />
              </>
            )}

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <PostOptionsControl
                post={post}
                isOwner={isOwner}
                onDeleteConfirm={remove}
              />
            </div>
          </header>

          <p className="mt-1.5 leading-relaxed break-words whitespace-pre-wrap text-bone">
            {post.body}
          </p>

          <PostMovies movies={post.movies} />

          <div className="mt-3 flex items-center gap-1">
            <ActionButton
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
              label={commentCount > 0 ? `${commentCount} ${commentCount === 1 ? "Comment" : "Comments"}` : "Comment"}
              tone="text-bone"
              onClick={handleLoadMore}
            />

            <ActionButton
              icon="hugeicons:repost"
              filled={reposted}
              count={reposts}
              label={reposted ? "Undo repost" : "Repost"}
              tone="text-bone"
              onClick={() =>
                react("repost", !reposted, setRepostedState, (delta) =>
                  setReposts((current) => current + delta),
                )
              }
            />

            <ShareControl
              postPath={`/post/${post.id}`}
              text={post.body.slice(0, 100)}
            />
          </div>

          {/* Comments list & input box section (always visible) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="comments-section mt-3.5 space-y-3 border-l-2 border-ink-line pl-3.5 pt-1 cursor-default"
          >
            {commentCount > 0 && (
              <div className="space-y-2.5">
                {loadingComments && comments === null ? (
                  <p className="meta !text-xs py-1 text-bone-dim">Loading comments…</p>
                ) : (
                  <>
                    {shownComments.map((comment) => (
                      <CommentRow
                        key={comment.id}
                        comment={comment}
                        viewerId={viewerId}
                        followingIds={followingIds}
                        onRemoved={(id) => {
                          setComments((current) => (current ?? []).filter((c) => c.id !== id));
                          setCommentCount((current) => Math.max(0, current - 1));
                        }}
                      />
                    ))}

                    {comments && comments.length > 1 && (
                      visibleCount < comments.length ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="meta !text-xs text-bone-dim hover:text-bone hover:underline transition-colors pt-1 block cursor-pointer"
                        >
                          Load more comments
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setVisibleCount(1)}
                          className="meta !text-xs text-bone-dim hover:text-bone hover:underline transition-colors pt-1 block cursor-pointer"
                        >
                          Hide comments
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {/* Comment input box always shown */}
            <CommentComposer
              postId={post.id}
              onAdded={(newComment) => {
                setComments((current) => [newComment, ...(current ?? [])]);
                setCommentCount((current) => current + 1);
              }}
            />
          </div>

          {error && (
            <p role="alert" className="meta mt-2 !text-ember text-xs">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** "You reposted" / "Ada reposted", above the post it put back in front of you. */
function RepostLine({ by, viewerId }: { by: PostAuthor; viewerId: string | null }) {
  return (
    <p className="meta mb-2.5 flex items-center gap-2 pl-[3.75rem] !text-xs text-bone-dim">
      <Icon icon="hugeicons:repost" width={14} height={14} aria-hidden />
      {viewerId === by.id ? (
        "You reposted"
      ) : (
        <>
          <Link href={`/${by.username}`} className="hover:text-lamp font-medium">
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

export function TimeAgo({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    subscribeToTick,
    () => relativeTime(iso),
    () => null,
  );

  return <time dateTime={iso}>{label}</time>;
}

export function ActionButton({
  icon,
  filled,
  count,
  label,
  textLabel,
  tone,
  expanded,
  onClick,
}: {
  icon: string;
  filled: boolean;
  count: number;
  label: string;
  textLabel?: string;
  tone: string;
  expanded?: boolean;
  onClick: () => void;
}) {
  const displayLabel =
    textLabel ??
    (label === "Unlike"
      ? "Liked"
      : label === "Like"
        ? "Like"
        : label === "Undo repost"
          ? "Reposted"
          : label === "Repost"
            ? "Repost"
            : label.includes("Comment")
              ? "Comment"
              : label);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={expanded === undefined ? filled : undefined}
      aria-expanded={expanded}
      className={`group flex items-center gap-1.5 rounded-full py-1.5 px-3 text-xs sm:text-sm font-medium transition-all ${
        filled
          ? `${tone} bg-bone/8`
          : "text-bone-dim hover:text-bone hover:bg-bone/8"
      }`}
    >
      <Icon
        icon={icon}
        width={16}
        height={16}
        aria-hidden
        className={`pointer-events-none transition-transform group-active:scale-125 ${filled ? "[&_*]:fill-current" : ""}`}
      />
      {displayLabel && <span className="hidden sm:inline">{displayLabel}</span>}
      <span className="tabular-nums">{count > 0 ? count : ""}</span>
    </button>
  );
}

/**
 * Unified 3-dots post options menu: Share, Delete post (if owner), and Cancel.
 */
export function PostOptionsControl({
  post,
  isOwner,
  onDeleteConfirm,
}: {
  post: Post;
  isOwner: boolean;
  onDeleteConfirm?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!showDeleteModal && !showShareModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
        setShowShareModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDeleteModal, showShareModal]);

  return (
    <>
      <div ref={ref} className={`relative inline-block ${menuOpen ? "z-50" : ""}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="Post options"
          className="grid size-7 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone cursor-pointer"
        >
          <Icon icon="lucide:more-horizontal" width={17} height={17} aria-hidden />
        </button>

        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-xl border border-ink-line bg-[#0c1116] opacity-100 shadow-2xl p-1.5"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setShowShareModal(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-bone transition-colors hover:bg-bone/10 cursor-pointer"
            >
              <Icon icon="lucide:share" width={14} height={14} className="shrink-0 text-bone-dim" />
              Share
            </button>

            {isOwner && onDeleteConfirm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setShowDeleteModal(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ember transition-colors hover:bg-ember/15 whitespace-nowrap cursor-pointer"
              >
                <Icon icon="lucide:trash-2" width={14} height={14} className="shrink-0" />
                Delete post
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone cursor-pointer"
            >
              <Icon icon="lucide:x" width={14} height={14} className="shrink-0" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {showShareModal && (
        <ShareModal
          postPath={`/post/${post.id}`}
          text={post.body.slice(0, 100)}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showDeleteModal && onDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close modal"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteModal(false);
            }}
            className="scrim-in fixed inset-0 bg-ink/70 backdrop-blur-md"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Delete post"
            className="palette-in relative z-10 w-full max-w-sm overflow-hidden rounded-xl border border-ink-line bg-ink-raised shadow-2xl p-6 space-y-4"
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-bone">Delete post?</h3>
              <p className="text-sm leading-relaxed text-bone-soft">
                This action cannot be undone. This post will be permanently removed from your profile and feed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-quiet !text-xs !py-2 !px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  onDeleteConfirm();
                }}
                className="btn !bg-ember !text-bone hover:!bg-ember/85 !text-xs !py-2 !px-4 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Share modal overlay styled like SearchOverlay scrim.
 */
export function ShareModal({
  postPath,
  title,
  text,
  onClose,
}: {
  postPath: string;
  title?: string;
  text?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${postPath}`
      : postPath;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: title ?? "Check out this post on Kino",
          text: text ?? "Check out this post on Kino",
          url: fullUrl,
        });
        onClose();
      } catch {
        // user cancelled
      }
    }
  };

  const shareTitle = title ?? "Check out this post on Kino";
  const shareText = text ?? "Check out this post on Kino";

  const shareLinks = [
    {
      name: "Facebook",
      icon: "ri:facebook-circle-fill",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`,
    },
    {
      name: "X (Twitter)",
      icon: "ri:twitter-x-fill",
      url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(fullUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      name: "WhatsApp",
      icon: "ri:whatsapp-fill",
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${fullUrl}`)}`,
    },
    {
      name: "Email / Gmail",
      icon: "lucide:mail",
      url: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${fullUrl}`)}`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close modal"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="scrim-in fixed inset-0 bg-ink/70 backdrop-blur-md"
      />

      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share post"
        className="palette-in relative z-10 w-full max-w-xs overflow-hidden rounded-xl border border-ink-line bg-ink-raised shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-bone">Share post</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-bone-dim hover:text-bone p-1 rounded-full hover:bg-bone/10 transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>

        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-bone transition-colors hover:bg-bone/10 cursor-pointer"
          >
            <Icon
              icon={copied ? "lucide:check" : "lucide:link"}
              width={16}
              height={16}
              className={copied ? "text-lamp" : "text-bone-dim"}
            />
            {copied ? "Link Copied!" : "Copy Link"}
          </button>

          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-bone transition-colors hover:bg-bone/10 cursor-pointer"
            >
              <Icon icon="lucide:share" width={16} height={16} className="text-bone-dim" />
              More options…
            </button>
          )}

          <div className="my-2 border-t border-ink-line/60" />

          {shareLinks.map((item) => (
            <a
              key={item.name}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium text-bone-soft transition-colors hover:bg-bone/10 hover:text-bone cursor-pointer"
            >
              <Icon icon={item.icon} width={16} height={16} className="shrink-0" />
              {item.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Legacy alias for DeleteControl */
export function DeleteControl({
  onConfirm,
}: {
  confirming?: boolean;
  onAsk?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
}) {
  return (
    <PostOptionsControl
      post={{ id: "", body: "" } as Post}
      isOwner={true}
      onDeleteConfirm={onConfirm}
    />
  );
}

/**
 * Share post menu: copy link, native OS web share, and direct social links.
 */
export function ShareControl({
  postPath,
  title,
  text,
}: {
  postPath: string;
  title?: string;
  text?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${postPath}`
      : postPath;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: title ?? "Check out this post on Kino",
          text: text ?? "Check out this post on Kino",
          url: fullUrl,
        });
        setOpen(false);
      } catch {
        // user cancelled
      }
    }
  };

  const shareTitle = title ?? "Check out this post on Kino";
  const shareText = text ?? "Check out this post on Kino";

  const shareLinks = [
    {
      name: "Facebook",
      icon: "ri:facebook-circle-fill",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`,
    },
    {
      name: "X (Twitter)",
      icon: "ri:twitter-x-fill",
      url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(fullUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      name: "WhatsApp",
      icon: "ri:whatsapp-fill",
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${fullUrl}`)}`,
    },
    {
      name: "Email / Gmail",
      icon: "lucide:mail",
      url: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${fullUrl}`)}`,
    },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="Share post"
        className={`group flex items-center gap-1.5 rounded-full py-1.5 px-3 text-xs sm:text-sm font-medium transition-all ${
          open
            ? "text-bone bg-bone/8"
            : "text-bone-dim hover:text-bone hover:bg-bone/8"
        }`}
      >
        <Icon
          icon="lucide:share-2"
          width={16}
          height={16}
          aria-hidden
          className="pointer-events-none transition-transform group-active:scale-125"
        />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 bottom-full mb-2 z-50 w-48 rounded-xl border border-ink-line bg-[#0c1116] opacity-100 shadow-2xl p-1.5"
        >
          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-bone transition-colors hover:bg-bone/10"
          >
            <Icon
              icon={copied ? "lucide:check" : "lucide:link"}
              width={15}
              height={15}
              className={copied ? "text-lamp" : "text-bone-dim"}
            />
            {copied ? "Link Copied!" : "Copy Link"}
          </button>

          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-bone transition-colors hover:bg-bone/10"
            >
              <Icon icon="lucide:share" width={15} height={15} className="text-bone-dim" />
              More options…
            </button>
          )}

          <div className="my-1 border-t border-ink-line/60" />

          {shareLinks.map((item) => (
            <a
              key={item.name}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-bone-soft transition-colors hover:bg-bone/10 hover:text-bone"
            >
              <Icon icon={item.icon} width={15} height={15} className="shrink-0" />
              {item.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sleek 3-dots delete options menu for comments with confirmation modal dialog.
 */
function CommentDeleteControl({
  onConfirm,
  onMenuOpenChange,
}: {
  onConfirm: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const [menuOpen, setMenuOpenState] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const setMenuOpen = useCallback(
    (open: boolean) => {
      setMenuOpenState(open);
      onMenuOpenChange?.(open);
    },
    [onMenuOpenChange]
  );

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, setMenuOpen]);

  useEffect(() => {
    if (!showConfirmModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowConfirmModal(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirmModal]);

  return (
    <>
      <div ref={ref} className={`relative ml-auto shrink-0 inline-block ${menuOpen ? "z-50" : ""}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="Comment options"
          className="grid size-6 place-items-center rounded-full text-bone-dim transition-all hover:bg-bone/10 hover:text-bone opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 cursor-pointer"
        >
          <Icon icon="lucide:more-horizontal" width={14} height={14} aria-hidden />
        </button>

        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-1 z-[100] w-40 rounded-xl border border-ink-line bg-[#0c1116] opacity-100 shadow-2xl p-1.5"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setShowConfirmModal(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ember transition-colors hover:bg-ember/15 whitespace-nowrap cursor-pointer"
            >
              <Icon icon="lucide:trash-2" width={14} height={14} className="shrink-0" />
              Delete comment
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone cursor-pointer"
            >
              <Icon icon="lucide:x" width={14} height={14} className="shrink-0" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close modal"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirmModal(false);
            }}
            className="scrim-in fixed inset-0 bg-ink/70 backdrop-blur-md"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Delete comment"
            className="palette-in relative z-10 w-full max-w-sm overflow-hidden rounded-xl border border-ink-line bg-ink-raised shadow-2xl p-6 space-y-4"
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-bone">Delete comment?</h3>
              <p className="text-sm leading-relaxed text-bone-soft">
                This action cannot be undone. This comment will be permanently removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn btn-quiet !text-xs !py-2 !px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  onConfirm();
                }}
                className="btn !bg-ember !text-bone hover:!bg-ember/85 !text-xs !py-2 !px-4 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CommentRow({
  comment,
  viewerId,
  followingIds = [],
  onRemoved,
}: {
  comment: PostComment;
  viewerId?: string | null;
  followingIds?: string[];
  onRemoved: (commentId: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCommentOwner = viewerId !== null && viewerId === comment.author.id;
  const isFollowingAuthor = followingIds.includes(comment.author.id);

  function remove() {
    setError(null);
    onRemoved(comment.id);
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className={`group/comment flex gap-2.5 animate-comment-fade ${isMenuOpen ? "relative z-50" : "relative z-0"}`}>
      <Link href={`/${comment.author.username}`} className="shrink-0 pt-0.5">
        <Avatar
          url={avatarUrl(comment.author.avatar_path)}
          initials={initialsFor(comment.author.display_name, comment.author.username)}
          size={28}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-x-1.5 flex-wrap">
          <Link
            href={`/${comment.author.username}`}
            className="truncate text-sm font-semibold text-bone hover:underline"
          >
            {displayNameFor(comment.author.display_name, comment.author.username)}
          </Link>
          <Link
            href={`/${comment.author.username}`}
            className="meta truncate !text-xs text-bone-dim hover:underline"
          >
            @{comment.author.username}
          </Link>
          <span aria-hidden className="text-bone-dim/40 text-xs">·</span>
          <span className="meta !text-xs text-bone-dim">
            <TimeAgo iso={comment.createdAt} />
          </span>

          {!isCommentOwner && (
            <>
              <span aria-hidden className="text-bone-dim/40 text-xs">·</span>
              <FollowButton
                targetId={comment.author.id}
                targetUsername={comment.author.username}
                initialFollowing={isFollowingAuthor}
                className={(active) =>
                  `!text-xs font-medium transition-colors cursor-pointer bg-transparent border-none !p-0 !h-auto ${
                    active ? "text-bone-dim hover:text-bone" : "text-bone-soft hover:text-bone"
                  }`
                }
              />
            </>
          )}

          {comment.deletableByViewer && (
            <CommentDeleteControl onConfirm={remove} onMenuOpenChange={setIsMenuOpen} />
          )}
        </div>

        <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-bone-soft">
          {comment.body}
        </p>

        {error && (
          <p role="alert" className="meta mt-1 !text-ember text-xs">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export function CommentComposer({
  postId,
  onAdded,
}: {
  postId: string;
  onAdded: (comment: PostComment) => void;
}) {
  const signedIn = useSignedIn();
  const signIn = useSignIn();
  const user = useSessionUser();

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <div className="flex items-center gap-2.5 pt-1">
        <Avatar url={null} initials="?" size={28} className="shrink-0 opacity-60" />
        <button
          type="button"
          onClick={() => signIn("To comment on this post")}
          className="meta py-2 transition-colors hover:text-bone text-xs"
        >
          Sign in to comment
        </button>
      </div>
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
        inputRef.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2.5 pt-1">
      <Avatar
        url={user?.avatarUrl ?? null}
        initials={user?.initials ?? "?"}
        size={28}
        className="shrink-0"
      />
      <input
        ref={inputRef}
        type="text"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Write a comment…"
        aria-label="Write a comment"
        className="h-9 min-w-0 flex-1 rounded-lg border border-ink-line bg-bone/8 px-3.5 text-xs sm:text-sm text-bone transition-colors placeholder:text-bone-dim focus:outline-none focus-visible:outline-none composer-input"
      />

      {body.length > 0 && (
        <span
          className={`meta tabular-nums text-[0.6875rem] shrink-0 ${
            body.length >= MAX_COMMENT_LENGTH - 20
              ? "!text-ember font-semibold"
              : "text-bone-dim/70"
          }`}
        >
          {body.length}/{MAX_COMMENT_LENGTH}
        </span>
      )}

      <button
        type="submit"
        disabled={body.trim().length === 0 || pending}
        aria-label="Send comment"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-bone/10 bg-bone/10 text-bone transition-all hover:bg-bone/20 active:scale-95 disabled:opacity-40 !p-0"
      >
        <Icon icon="lucide:send" width={16} height={16} />
      </button>

      {error && (
        <p role="alert" className="meta !text-ember text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
