import Link from "next/link";

import { AppShell } from "@/app/components/app-shell";
import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import { PeopleSearch } from "@/app/components/people-search";
import { PostComposer } from "@/app/components/post-composer";
import { PostList } from "@/app/components/post-list";
import { getViewer } from "@/lib/auth/viewer";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getFollowingIds } from "@/lib/profiles/follows";
import { getSuggestedProfiles, type ProfileResult } from "@/lib/profiles/search";
import { getFeedCandidates } from "@/lib/social/queries";
import { getFeedAffinity, rankFeed } from "@/lib/social/ranking";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The feed.
 *
 * Public, like the catalog: a visitor without an account sees what people are
 * saying, ordered by recency and engagement because nothing else about them is
 * known. Signing in is what turns that into a feed — the follow graph, the
 * ratings and the vector neighbours of a favourite film all come from an
 * account, and all three feed `rankFeed`.
 *
 * The rail is the other half of the feature: a search that finds people rather
 * than films, and a short list of accounts to follow. It sits here rather than
 * in the header because the header's search is the film search and has been
 * since before there were profiles — see `people-search.tsx`.
 */

export const metadata = { title: "Feed" };

/** How many ranked entries make the page. The pool is far larger; see FEED_CANDIDATES. */
const FEED_LENGTH = 40;

export default async function FeedPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);

  // Read once and passed to all three: the candidates query needs it to find
  // reposts worth surfacing, the ranker needs it to weight authors, and the
  // rail needs it to avoid suggesting people already followed.
  const followingIds = viewer ? [...(await getFollowingIds(supabase, viewer.id))] : [];

  const [candidates, affinity, suggestions] = await Promise.all([
    getFeedCandidates(supabase, { viewerId: viewer?.id ?? null, followingIds }),
    getFeedAffinity(supabase, viewer?.id ?? null, followingIds),
    getSuggestedProfiles(supabase, viewer ? [viewer.id, ...followingIds] : []),
  ]);

  const entries = rankFeed(candidates, affinity, { limit: FEED_LENGTH });

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-14">
        <div className="min-w-0 max-w-2xl">
          <header>
            <h1 className="text-2xl font-bold text-bone sm:text-3xl">Feed</h1>
            <p className="meta mt-1">{orderingNote(viewer !== null, followingIds.length)}</p>
          </header>

          <div className="mt-6">
            <PostComposer
              displayName={viewer?.displayName ?? "there"}
              avatarUrl={viewer?.avatarUrl ?? null}
              initials={viewer?.initials ?? "?"}
            />
          </div>

          <div className="mt-6">
            {entries.length === 0 ? (
              <EmptyFeed signedIn={viewer !== null} />
            ) : (
              <PostList entries={entries} viewerId={viewer?.id ?? null} />
            )}
          </div>
        </div>

        {/* Below the feed on a phone, beside it from lg up — a search box you
            have to scroll past to reach the posts is a search box in the way. */}
        <aside className="mt-12 lg:sticky lg:top-28 lg:mt-0 lg:h-fit lg:self-start">
          <h2 className="label">Find people</h2>
          <div className="mt-3">
            <PeopleSearch />
          </div>

          {suggestions.length > 0 && (
            <section className="mt-8">
              <h2 className="label">New here</h2>
              <ul className="mt-3 flex flex-col gap-4">
                {suggestions.map((person) => (
                  <SuggestionRow
                    key={person.id}
                    person={person}
                    showFollow={viewer !== null}
                  />
                ))}
              </ul>
              <Link
                href="/people"
                className="meta mt-4 inline-block transition-colors hover:text-lamp"
              >
                Search everyone
              </Link>
            </section>
          )}
        </aside>
      </main>
    </AppShell>
  );
}

/**
 * One line saying what the order means.
 *
 * A ranked feed that doesn't say it's ranked reads as a broken chronological
 * one the first time a two-hour-old post sits above a ten-minute-old one.
 */
function orderingNote(signedIn: boolean, following: number): string {
  if (!signedIn) return "What people are saying. Sign in and it reorders around your taste.";
  if (following === 0) {
    return "Ranked by the films you rate. Follow a few people and they'll rise to the top.";
  }
  return "Ranked by who you follow, the films you rate, and what's just been posted.";
}

function EmptyFeed({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="py-6">
      <h2 className="text-xl font-bold text-bone">Nothing posted yet</h2>
      <p className="mt-2 max-w-md leading-relaxed text-bone-soft">
        {signedIn
          ? "Be the first. Write about something you've just watched and attach the film — it'll show up on your profile too."
          : "Once people start posting about what they're watching, this is where it lands."}
      </p>
      <Link href="/" className="btn btn-quiet mt-6">
        Browse the catalog
      </Link>
    </section>
  );
}

/** One suggested account: who they are, their bio if they wrote one, and a follow. */
function SuggestionRow({
  person,
  showFollow,
}: {
  person: ProfileResult;
  showFollow: boolean;
}) {
  return (
    <li>
      <div className="flex items-start gap-3">
        <Link href={`/${person.username}`} className="shrink-0">
          <Avatar
            url={avatarUrl(person.avatar_path)}
            initials={initialsFor(person.display_name, person.username)}
            size={38}
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/${person.username}`} className="block min-w-0">
            <p className="truncate text-sm font-semibold text-bone">
              {displayNameFor(person.display_name, person.username)}
            </p>
            <p className="meta truncate !text-xs">@{person.username}</p>
          </Link>

          {person.bio && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-bone-soft">
              {person.bio}
            </p>
          )}

          {showFollow && (
            <div className="mt-2">
              <FollowButton
                targetId={person.id}
                targetUsername={person.username}
                initialFollowing={false}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
