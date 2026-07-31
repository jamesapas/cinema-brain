"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deletePost,
  setLiked,
  setReposted,
} from "@/app/actions/posts";
import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import {
  ActionButton,
  CommentComposer,
  CommentRow,
  DeleteControl,
  ShareControl,
  TimeAgo,
} from "@/app/components/post-card";
import { PostMovies } from "@/app/components/post-movies";
import { useSignIn, useSignedIn } from "@/app/components/session";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import type { FeedEntry, PostComment } from "@/lib/social/posts";

/**
 * Dedicated single post view for permalink pages (`/post/[id]`).
 *
 * Clean 2-column layout on desktop:
 * - Left column: Large author profile, prominent post body text, attached movies, and actions.
 * - Right column: Comments section containing the comment composer and reply thread.
 */
export function SinglePostView({
  entry,
  viewerId,
  followingIds = [],
  initialComments = [],
}: {
  entry: FeedEntry;
  viewerId: string | null;
  followingIds?: string[];
  initialComments?: PostComment[];
}) {
  const { post } = entry;
  const signedIn = useSignedIn();
  const signIn = useSignIn();
  const router = useRouter();

  const [liked, setLikedState] = useState(post.likedByViewer);
  const [likes, setLikes] = useState(post.likes);
  const [reposted, setRepostedState] = useState(post.repostedByViewer);
  const [reposts, setReposts] = useState(post.reposts);

  const [comments, setComments] = useState<PostComment[]>(initialComments);
  const [commentCount, setCommentCount] = useState(
    Math.max(post.comments, initialComments.length),
  );

  const [removed, setRemoved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const isOwner = viewerId !== null && viewerId === post.author.id;
  const isFollowing = followingIds.includes(post.author.id);

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

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.ok) {
        setRemoved(true);
        router.push("/feed");
      } else {
        setConfirmingDelete(false);
        setError(result.error);
      }
    });
  }

  if (removed) return null;

  return (
    <div className="w-full lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12 xl:gap-16">
      {/* Main Post Section (Left Column) */}
      <div className="min-w-0 flex-1">
        <Link
          href="/feed"
          className="meta inline-flex items-center gap-1.5 text-xs text-bone-dim transition-colors hover:text-bone mb-6"
        >
          <Icon icon="lucide:arrow-left" width={15} height={15} aria-hidden />
          Back to the feed
        </Link>

        <article className="mt-4 pb-6 border-b lg:border-b-0 border-ink-line">
          {/* Author Header */}
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link href={`/${post.author.username}`} className="shrink-0">
                <Avatar
                  url={avatarUrl(post.author.avatar_path)}
                  initials={initialsFor(post.author.display_name, post.author.username)}
                  size={52}
                />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/${post.author.username}`}
                    className="truncate font-bold text-bone text-base sm:text-lg hover:underline"
                  >
                    {displayNameFor(post.author.display_name, post.author.username)}
                  </Link>
                  <Link
                    href={`/${post.author.username}`}
                    className="meta truncate !text-xs text-bone-dim hover:underline"
                  >
                    @{post.author.username}
                  </Link>
                </div>
                <p className="meta mt-0.5 !text-xs text-bone-dim">
                  <TimeAgo iso={post.createdAt} />
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isOwner && (
                <FollowButton
                  targetId={post.author.id}
                  targetUsername={post.author.username}
                  initialFollowing={isFollowing}
                  className={(active) =>
                    `px-4 py-1.5 text-xs h-8 rounded-full font-semibold transition-colors ${
                      active ? "btn btn-quiet" : "btn btn-primary"
                    }`
                  }
                />
              )}

              {isOwner && (
                <DeleteControl
                  confirming={confirmingDelete}
                  onAsk={() => setConfirmingDelete(true)}
                  onCancel={() => setConfirmingDelete(false)}
                  onConfirm={remove}
                />
              )}
            </div>
          </header>

          {/* Post Body Text */}
          <p className="mt-6 text-base sm:text-lg leading-relaxed break-words whitespace-pre-wrap text-bone">
            {post.body}
          </p>

          {/* Movies attached to the post */}
          {post.movies?.length > 0 && (
            <div className="mt-6 pt-4 border-t border-ink-line/60">
              <p className="meta !text-xs font-medium text-bone-dim mb-2">Tagged Films</p>
              <PostMovies movies={post.movies} />
            </div>
          )}

          {/* Action Metrics & Buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-ink-line pt-4">
            <div className="flex items-center gap-2">
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
                label="Comments"
                tone="text-bone"
                onClick={() => {}}
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
          </div>

          {error && (
            <p role="alert" className="meta mt-3 !text-ember text-xs">
              {error}
            </p>
          )}
        </article>
      </div>

      {/* Comments Sidebar (Right Column on desktop) */}
      <aside className="mt-8 lg:mt-0 lg:sticky lg:top-28 w-full space-y-5">
        <div className="flex items-center justify-between border-b border-ink-line pb-3.5">
          <h2 className="text-base font-bold text-bone flex items-center gap-2">
            <Icon icon="lucide:message-square" width={18} height={18} className="text-lamp" />
            Comments
          </h2>
        </div>

        {/* Comments list */}
        <div className="pt-2">
          {comments.length > 0 ? (
            <ul className="space-y-4 max-h-[32rem] overflow-y-auto pr-1 no-scrollbar">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  viewerId={viewerId}
                  followingIds={followingIds}
                  onRemoved={(id) => {
                    setComments((current) => current.filter((c) => c.id !== id));
                    setCommentCount((current) => Math.max(0, current - 1));
                  }}
                />
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center">
              <Icon icon="lucide:messages-square" width={32} height={32} className="mx-auto text-bone-dim/40 mb-2" />
              <p className="text-xs text-bone-dim font-medium">No comments yet</p>
              <p className="meta !text-[0.6875rem] text-bone-dim/70 mt-1">
                Be the first to share your thoughts on this post.
              </p>
            </div>
          )}
        </div>

        {/* Comment input box at bottom */}
        <div className="pt-3 border-t border-ink-line/60">
          <CommentComposer
            postId={post.id}
            onAdded={(newComment) => {
              setComments((current) => [...current, newComment]);
              setCommentCount((current) => current + 1);
            }}
          />
        </div>
      </aside>
    </div>
  );
}
