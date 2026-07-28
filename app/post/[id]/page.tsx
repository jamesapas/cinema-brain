import { Icon } from "@iconify/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { PostCard } from "@/app/components/post-card";
import { getViewer } from "@/lib/auth/viewer";
import { getComments, getPost } from "@/lib/social/queries";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * One post, on its own.
 *
 * The same card the feed renders, with its thread already open — a permalink is
 * somewhere you were sent to read the replies, so making you press the count
 * first would be a click in the way of the only reason you're here.
 *
 * Which is also why the comments are fetched server-side here and passed in,
 * where the feed leaves the card to fetch its own on demand. One post's replies
 * are the page; forty posts' replies would be most of the feed's payload spent
 * on text nobody asked to read.
 */

export const metadata = { title: "Post" };

type PageProps = { params: Promise<{ id: string }> };

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);

  const post = await getPost(supabase, id, viewer?.id ?? null);
  // A deleted post and an id that never existed are the same 404: there is
  // nothing to say about either, and distinguishing them says something about
  // what used to be here.
  if (!post) notFound();

  const comments = await getComments(supabase, post.id, viewer?.id ?? null, post.author.id);

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24">
        <div className="max-w-2xl">
          <Link
            href="/feed"
            className="meta inline-flex items-center gap-1.5 transition-colors hover:text-lamp"
          >
            <Icon icon="lucide:arrow-left" width={15} height={15} aria-hidden />
            Back to the feed
          </Link>

          <div className="mt-4">
            <PostCard
              // A permalink is the post as its author wrote it, never as
              // somebody's repost — the entry wrapper is the feed's idea.
              entry={{ key: post.id, post, repostedBy: null, at: post.createdAt }}
              viewerId={viewer?.id ?? null}
              initialComments={comments}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
