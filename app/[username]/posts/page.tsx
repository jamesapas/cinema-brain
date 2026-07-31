import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PostList } from "@/app/components/post-list";
import { ProfileSidebar } from "@/app/components/profile-sidebar";
import { getViewer } from "@/lib/auth/viewer";
import { getRatingStats } from "@/lib/movies/catalog";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getFollowCounts, getFollowingIds, isFollowing } from "@/lib/profiles/follows";
import { getProfileByUsername } from "@/lib/profiles/queries";
import { getUserEntries } from "@/lib/social/queries";
import { createServerSupabase } from "@/lib/supabase/server";

const JOINED_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

type PageProps = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { username } = await params;
  return { title: `Posts by @${username}` };
}

export default async function UserPostsPage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  const isOwner = viewer?.username?.toLowerCase() === username.toLowerCase();

  const profile = isOwner ? viewer!.profile : await getProfileByUsername(supabase, username);
  if (!profile) notFound();

  const [{ stats }, counts, viewerFollows] = await Promise.all([
    getRatingStats(supabase, profile.id),
    getFollowCounts(supabase, profile.id),
    viewer && !isOwner ? isFollowing(supabase, viewer.id, profile.id) : Promise.resolve(false),
  ]);

  const name = isOwner ? viewer!.displayName : displayNameFor(profile.display_name, profile.username);
  const initials = isOwner ? viewer!.initials : initialsFor(profile.display_name, profile.username);
  const picture = isOwner ? viewer!.avatarUrl : avatarUrl(profile.avatar_path);
  const joined = JOINED_FORMAT.format(new Date(profile.created_at));

  return (
    <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
      <ProfileSidebar
        displayName={name}
        username={profile.username}
        avatarUrl={picture}
        initials={initials}
        bio={profile.bio}
        followers={counts.followers}
        following={counts.following}
        isOwner={isOwner}
        profileId={profile.id}
        viewerFollows={viewerFollows}
        joinedDate={joined}
        statsCount={stats.count}
        statsAverage={stats.averageStars ? `${stats.averageStars.toFixed(1)}★` : "—"}
      />

      <div className="mt-10 lg:mt-0">
        <h1 className="border-b border-ink-line pb-4 text-xl font-bold text-bone">
          {isOwner ? "Your posts" : `Posts by ${name}`}
        </h1>

        <Suspense fallback={<PostsListSkeleton />}>
          <UserPostsStream
            profileId={profile.id}
            viewerId={viewer?.id ?? null}
            isOwner={isOwner}
            name={name}
          />
        </Suspense>
      </div>
    </main>
  );
}

async function UserPostsStream({
  profileId,
  viewerId,
  isOwner,
  name,
}: {
  profileId: string;
  viewerId: string | null;
  isOwner: boolean;
  name: string;
}) {
  const supabase = await createServerSupabase();
  const [entries, followingSet] = await Promise.all([
    getUserEntries(supabase, profileId, viewerId),
    viewerId ? getFollowingIds(supabase, viewerId) : Promise.resolve(new Set<string>()),
  ]);

  if (entries.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-xl font-bold text-bone">No posts yet</h2>
        <p className="mt-2 max-w-md leading-relaxed text-bone-soft">
          {isOwner
            ? "You haven't posted yet. Write about something you've watched in the feed!"
            : `${name} hasn't posted anything yet.`}
        </p>
        {isOwner && (
          <Link href="/feed" className="btn btn-quiet mt-5">
            Write a post
          </Link>
        )}
      </section>
    );
  }

  return (
    <div className="mt-6">
      <PostList
        entries={entries}
        viewerId={viewerId}
        followingIds={[...followingSet]}
      />
    </div>
  );
}

function PostsListSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border-b border-ink-line pb-6 pt-2">
          <div className="flex gap-3 sm:gap-4">
            <div className="skeleton size-9 sm:size-[44px] shrink-0 rounded-full" />

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="skeleton h-3.5 sm:h-4 w-24 sm:w-28 rounded-md" />
                    <div className="skeleton h-3 w-16 sm:w-20 rounded-md" />
                  </div>
                  <div className="skeleton h-3 w-14 sm:w-16 rounded-md" />
                </div>
                <div className="skeleton h-7 w-7 sm:w-8 shrink-0 rounded-full" />
              </div>

              <div className="space-y-2 pt-0.5">
                <div className="skeleton h-3 sm:h-3.5 w-[92%] rounded-md" />
                <div className="skeleton h-3 sm:h-3.5 w-[65%] rounded-md" />
              </div>

              {i % 2 === 0 && (
                <div className="pt-1 flex gap-3 flex-nowrap">
                  <div className="space-y-1.5 w-20 sm:w-28 shrink-0">
                    <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                    <div className="skeleton h-3 w-14 sm:w-16 rounded-md" />
                  </div>
                  <div className="space-y-1.5 w-20 sm:w-28 shrink-0">
                    <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                    <div className="skeleton h-3 w-16 sm:w-20 rounded-md" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 sm:gap-4 pt-1">
                <div className="skeleton h-6 w-12 sm:w-14 rounded-full" />
                <div className="skeleton h-6 w-20 sm:w-24 rounded-full" />
                <div className="skeleton h-6 w-14 sm:w-16 rounded-full" />
              </div>

              <div className="pt-2 border-l-2 border-ink-line pl-3.5 flex items-center gap-2.5">
                <div className="skeleton size-6 sm:size-7 shrink-0 rounded-full" />
                <div className="skeleton h-8 sm:h-9 min-w-0 flex-1 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
