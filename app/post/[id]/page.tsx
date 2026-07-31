import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SinglePostView } from "@/app/components/single-post-view";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowingIds } from "@/lib/profiles/follows";
import { getComments, getPost } from "@/lib/social/queries";
import { createServerSupabase } from "@/lib/supabase/server";

import Loading from "./loading";

/**
 * One post permalink page.
 *
 * Rendered using `SinglePostView`, which provides an expanded 2-column layout on desktop:
 * main post details & media on the left, discussion & replies on the right.
 */

export const metadata = { title: "Post" };

type PageProps = { params: Promise<{ id: string }> };

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<Loading />}>
      <PostContent id={id} />
    </Suspense>
  );
}

async function PostContent({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);

  const [post, followingIds] = await Promise.all([
    getPost(supabase, id, viewer?.id ?? null),
    viewer ? getFollowingIds(supabase, viewer.id) : Promise.resolve([]),
  ]);

  if (!post) notFound();

  const comments = await getComments(supabase, post.id, viewer?.id ?? null, post.author.id);

  return (
    <main className="page-container flex-1 pt-24 sm:pt-28 pb-24 max-w-6xl">
      <SinglePostView
        entry={{ key: post.id, post, repostedBy: null, at: post.createdAt }}
        viewerId={viewer?.id ?? null}
        followingIds={[...followingIds]}
        initialComments={comments}
      />
    </main>
  );
}
