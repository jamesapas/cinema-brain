import { AppShell } from "@/app/components/app-shell";
import { FollowListRow } from "@/app/components/follow-list-row";
import { PeopleSearchField } from "@/app/components/people-search-field";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowingIds } from "@/lib/profiles/follows";
import { MIN_SEARCH_LENGTH, searchProfiles } from "@/lib/profiles/search";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * People search as a page — the linkable half of the feature, the same way
 * /search is the linkable half of the film overlay.
 *
 * Rows are the followers/following row, unchanged: someone you found by
 * searching and someone who follows you are the same thing to look at, and the
 * follow button belongs on both.
 */

export const metadata = { title: "People" };

const RESULT_LIMIT = 40;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const supabase = await createServerSupabase();

  // A repeated ?q= arrives as an array; take the first rather than rendering
  // "a,b" back into the box.
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();

  const [viewer, results] = await Promise.all([
    getViewer(supabase),
    searchProfiles(supabase, query, RESULT_LIMIT),
  ]);

  const followingIds = viewer
    ? await getFollowingIds(supabase, viewer.id)
    : new Set<string>();

  const tooShort = query.length > 0 && query.length < MIN_SEARCH_LENGTH;

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-bone sm:text-3xl">People</h1>
          <div className="mt-5">
            <PeopleSearchField initialQuery={query} />
          </div>
        </div>

        <div className="mt-10 max-w-2xl">
          {query.length === 0 ? (
            <p className="max-w-lg leading-relaxed text-bone-soft">
              Search by name or handle. Following someone puts their posts at the top of
              your feed.
            </p>
          ) : tooShort ? (
            <p className="max-w-lg leading-relaxed text-bone-soft">
              Keep going — {MIN_SEARCH_LENGTH} letters or more.
            </p>
          ) : results.people.length === 0 ? (
            <>
              <h2 className="text-xl font-bold text-bone">Nobody matches “{query}”</h2>
              <p className="mt-2 max-w-lg leading-relaxed text-bone-soft">
                Check the spelling, or try their handle instead of their name.
              </p>
            </>
          ) : (
            <>
              <p className="meta">
                {results.hasMore
                  ? `Showing the first ${RESULT_LIMIT} matches for “${query}”`
                  : `${results.people.length} ${
                      results.people.length === 1 ? "person" : "people"
                    } matching “${query}”`}
              </p>

              <ul className="mt-2 flex flex-col divide-y divide-ink-line">
                {results.people.map((person) => (
                  <FollowListRow
                    key={person.id}
                    profile={person}
                    showFollowButton={viewer !== null && viewer.id !== person.id}
                    initialFollowing={followingIds.has(person.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
