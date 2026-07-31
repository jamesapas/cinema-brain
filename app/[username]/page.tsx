import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { KinoTake } from "@/app/components/kino-take";
import { PostList } from "@/app/components/post-list";
import { ProfileSidebar } from "@/app/components/profile-sidebar";
import { RatedFilmsGrid } from "@/app/components/rated-films-grid";
import { SignInPrompt } from "@/app/components/sign-in-prompt";
import { getViewer } from "@/lib/auth/viewer";
import { getRatingStats, getUserNotes } from "@/lib/movies/catalog";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getFollowCounts, getFollowingIds, isFollowing } from "@/lib/profiles/follows";
import { getProfileByUsername } from "@/lib/profiles/queries";
import { type StarBucket } from "@/lib/profiles/stats";
import { MIN_RATED_FOR_SUMMARY, summaryIsStale } from "@/lib/profiles/taste-summary";
import type { FeedEntry } from "@/lib/social/posts";
import { getUserEntries } from "@/lib/social/queries";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Anyone's profile, by handle — one URL for the owner and every visitor.
 *
 * The owner gets the full dashboard: the rail (with its private links to
 * watchlist/favorites/settings/sign-out) and their notes alongside the rated
 * grid. A visitor gets the same header shape without the private nav, a
 * follow button in the rail's place, and the rated grid minus notes — those
 * stay written for the owner's own reading, not the account's audience.
 *
 * Posts sit between the taste summary and the rated grid: what someone has
 * said lately is more current than what they've scored, and it's the half of
 * the page a visitor arriving from the feed came to read.
 */

/** Short form for the visitor rail's tight stats — "Jul 2026", not "July 2026". */
const JOINED_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

type PageProps = { params: Promise<{ username: string }> };

export default async function UsernamePage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  const isOwner = viewer?.username?.toLowerCase() === username.toLowerCase();

  const profile = isOwner ? viewer!.profile : await getProfileByUsername(supabase, username);
  if (!profile) {
    if (isOwner) {
      // Signed in, but the trigger hasn't backfilled a row yet.
      return (
        <main className="page-container flex flex-1 items-center justify-center pt-28 pb-24">
          <SignInPrompt
            heading="Your profile is waiting"
            body="How you score things, what you gravitate towards, and every film you've rated. Sign in to see yours."
            reason="To see your profile"
          />
        </main>
      );
    }
    notFound();
  }

  // `getUserEntries` runs three sequential async rounds (fetch → hydrate →
  // attribute reposters) and is the slowest part of the page. It is fetched
  // inside `ProfilePosts` behind a Suspense boundary so the sidebar, rating
  // spread, and film grid can appear as soon as this faster trio resolves.
  const [{ stats, fingerprint, topGenres }, counts, viewerFollows, notes] = await Promise.all([
    getRatingStats(supabase, profile.id),
    getFollowCounts(supabase, profile.id),
    viewer && !isOwner ? isFollowing(supabase, viewer.id, profile.id) : Promise.resolve(false),
    isOwner ? getUserNotes(supabase, profile.id) : Promise.resolve([]),
  ]);

  const name = isOwner ? viewer!.displayName : displayNameFor(profile.display_name, profile.username);
  const initials = isOwner ? viewer!.initials : initialsFor(profile.display_name, profile.username);
  const picture = isOwner ? viewer!.avatarUrl : avatarUrl(profile.avatar_path);
  const joined = JOINED_FORMAT.format(new Date(profile.created_at));
  // Free to compute — a hash of rows this render already fetched. Only the
  // owner's browser acts on it, so deciding it here costs a visitor nothing.
  const stale = summaryIsStale(
    { count: stats.count, fingerprint },
    profile.taste_summary_key,
    profile.taste_summary_at,
  );

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

      <div className="mt-10 flex flex-col gap-12 lg:mt-0">
        {stats.count > 0 && (
          <div className="grid gap-10 lg:grid-cols-2">
            <RatingSpread
              distribution={stats.distribution}
              total={stats.count}
              averageStars={stats.averageStars}
              isOwner={isOwner}
            />
            <KinoTake
              name={name}
              isOwner={isOwner}
              summary={profile.taste_summary}
              stale={stale}
              ratedCount={stats.count}
              minRated={MIN_RATED_FOR_SUMMARY}
            />
          </div>
        )}

        {/* Posts stream independently: `getUserEntries` is the slowest
              section (multi-step fetch + hydration). Everything above this
              line is already visible while the posts boundary is resolving. */}
        <Suspense fallback={<PostsSkeleton />}>
          <ProfilePosts
            profileId={profile.id}
            viewerId={viewer?.id ?? null}
            isOwner={isOwner}
            name={name}
            username={profile.username}
          />
        </Suspense>

        {stats.count === 0 ? (
          <EmptyState isOwner={isOwner} />
        ) : (
          <>
            <RatedFilmsGrid
              userId={profile.id}
              heading={isOwner ? "Films you’ve rated" : "Films rated"}
              readOnly={!isOwner}
              totalCount={stats.count}
              availableGenres={topGenres}
            />

            {notes.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-bone">Your notes</h2>
                <ul className="mt-5 flex max-w-3xl flex-col gap-4">
                  {notes.map((entry) => (
                    <li
                      key={entry.movie.id}
                      className="border-l-2 border-ink-line pl-4 transition-colors hover:border-lamp"
                    >
                      <p className="font-semibold text-bone">
                        {entry.movie.title}{" "}
                        <span className="meta">· {entry.rating / 2}★</span>
                      </p>
                      <p className="mt-1 leading-relaxed text-bone-soft">{entry.notes}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/**
 * What this person has posted, and what they've put back in front of their
 * followers.
 *
 * Shown to a visitor only when there is something to show — an empty heading on
 * a stranger's page is a section that exists for the site's benefit rather than
 * the reader's. The owner always gets it, because "you haven't posted" is
 * information to them, and the prompt is the only place on this page that says
 * posting is a thing you can do.
 */
function PostsSection({
  entries,
  isOwner,
  name,
  username,
  viewerId,
  followingIds = [],
}: {
  entries: FeedEntry[];
  isOwner: boolean;
  name: string;
  username: string;
  viewerId: string | null;
  followingIds?: string[];
}) {
  if (entries.length === 0 && !isOwner) return null;

  const latestEntries = entries.slice(0, 1);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-bone">
          {isOwner ? "Your latest post" : `Latest post by ${name}`}
        </h2>
        {entries.length > 0 && (
          <Link
            href={`/${username}/posts`}
            className="text-sm font-medium text-bone-soft transition-colors hover:text-bone"
          >
            View all
          </Link>
        )}
      </div>

      {entries.length === 0 ? (
        <>
          <p className="mt-2 max-w-md leading-relaxed text-bone-soft">
            You haven&rsquo;t posted yet. Write about something you&rsquo;ve just watched
            and it shows up here and in everyone&rsquo;s feed.
          </p>
          <Link href="/feed" className="btn btn-quiet mt-5">
            Write a post
          </Link>
        </>
      ) : (
        <div className="mt-3">
          <PostList entries={latestEntries} viewerId={viewerId} followingIds={followingIds} />
        </div>
      )}
    </section>
  );
}

/**
 * The 10 half-star buckets, folded into 5 whole rows without favoring either
 * neighbor: a 4.5★ rating counts half toward the 4 row and half toward the 5
 * row, rather than rounding up (or down) and inflating one of them.
 */
function wholeStarShares(distribution: StarBucket[]): { stars: number; count: number }[] {
  const get = (stars: number) => distribution.find((b) => b.stars === stars)?.count ?? 0;

  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count:
      get(stars) +
      get(stars + 0.5) / 2 +
      // 0.5★ has no row below it to split with, so it goes to 1★ whole.
      (stars > 1 ? get(stars - 0.5) / 2 : get(0.5)),
  }));
}

function RatingSpread({
  distribution,
  total,
  averageStars,
  isOwner,
}: {
  distribution: StarBucket[];
  total: number;
  averageStars: number | null;
  isOwner: boolean;
}) {
  const breakdown = wholeStarShares(distribution);

  return (
    <section>
      <h2 className="text-xl font-bold text-bone">{isOwner ? "How you rate" : "How they rate"}</h2>

      <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:self-center">
          <p className="text-5xl leading-none font-bold text-bone">
            {averageStars ? averageStars.toFixed(1) : "—"}
          </p>
          <AverageStars value={averageStars ?? 0} />
          <p className="meta tabular-nums">{total.toLocaleString()} ratings</p>
        </div>

        <div className="flex w-full flex-1 flex-col justify-center gap-2">
          {breakdown.map((row) => (
            <div key={row.stars} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-right text-sm text-bone-soft tabular-nums">
                {row.stars}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-line">
                <span
                  className="block h-full rounded-full bg-lamp"
                  style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A static, read-only star row for an average — not the interactive rating control. */
function AverageStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = value >= star ? "full" : value >= star - 0.5 ? "half" : "empty";
        return (
          <svg key={star} viewBox="0 0 24 24" className="size-4">
            {fill === "half" && (
              <defs>
                <linearGradient id={`avg-star-half-${star}`}>
                  <stop offset="50%" stopColor="var(--color-lamp)" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              </defs>
            )}
            <path
              d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
              fill={
                fill === "full"
                  ? "var(--color-lamp)"
                  : fill === "half"
                    ? `url(#avg-star-half-${star})`
                    : "transparent"
              }
              stroke="var(--color-lamp)"
              strokeWidth="1.3"
              strokeLinejoin="round"
              opacity={fill === "empty" ? 0.45 : 1}
            />
          </svg>
        );
      })}
    </div>
  );
}

function EmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-bone">Nothing rated yet</h2>
      <p className="mt-2 max-w-md leading-relaxed text-bone-soft">
        {isOwner
          ? "Rate a few films and this page fills in — how you score things, what you gravitate towards, and how long you've spent on it."
          : "Once they rate a few films, this page fills in."}
      </p>
      {isOwner && (
        <Link href="/" className="btn btn-primary mt-6">
          Browse the catalog
        </Link>
      )}
    </section>
  );
}

// ─── streaming components ─────────────────────────────────────────────────────

/**
 * Posts section, streamed independently from the rest of the profile.
 *
 * `getUserEntries` makes three sequential async round-trips: (1) posts +
 * reposts in parallel, (2) author profiles + viewer like/repost state in
 * parallel, (3) reposter profiles. Extracting it here means the rating spread,
 * film grid, and sidebar are all visible while this boundary resolves.
 */
async function ProfilePosts({
  profileId,
  viewerId,
  isOwner,
  name,
  username,
}: {
  profileId: string;
  viewerId: string | null;
  isOwner: boolean;
  name: string;
  username: string;
}) {
  const supabase = await createServerSupabase();
  const [entries, followingSet] = await Promise.all([
    getUserEntries(supabase, profileId, viewerId),
    viewerId ? getFollowingIds(supabase, viewerId) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <PostsSection
      entries={entries}
      isOwner={isOwner}
      name={name}
      username={username}
      viewerId={viewerId}
      followingIds={[...followingSet]}
    />
  );
}

function PostsSkeleton() {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="skeleton h-6 w-28 rounded" />
      </div>
      <div className="mt-3">
        <div className="rounded-xl border border-ink-line p-5">
          <div className="flex items-center gap-3">
            <div className="skeleton size-9 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-28 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </section>
  );
}
