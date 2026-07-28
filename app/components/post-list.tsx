import { PostCard } from "@/app/components/post-card";
import type { FeedEntry } from "@/lib/social/posts";

/**
 * A column of posts, wherever one is shown.
 *
 * Thin on purpose — the card is where the work is. This exists so the feed, a
 * profile and a permalink can't drift apart on spacing and dividers, which is
 * the first thing that goes when three pages each map over the same array.
 *
 * `entry.key` rather than the post id: the same post can appear twice in one
 * feed, once as itself and once as somebody's repost.
 */
export function PostList({
  entries,
  viewerId,
}: {
  entries: FeedEntry[];
  viewerId: string | null;
}) {
  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <PostCard key={entry.key} entry={entry} viewerId={viewerId} />
      ))}
    </div>
  );
}
