import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { AskAgentButton } from "@/app/components/chat-overlay";
import { PosterCard } from "@/app/components/poster-card";
import { SearchField } from "@/app/components/search-field";
import { getRatingsByMovie, searchMoviesByTitle } from "@/lib/movies/catalog";
import { MIN_SEARCH_LENGTH } from "@/lib/movies/search-config";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getProfile } from "@/lib/profiles/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Search · Cinema Brain" };

const RESULT_LIMIT = 60;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A repeated ?q= arrives as an array; take the first rather than rendering
  // "a,b" back into the box.
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();

  const [profile, ratings, results] = await Promise.all([
    getProfile(supabase),
    getRatingsByMovie(supabase),
    searchMoviesByTitle(supabase, query, RESULT_LIMIT),
  ]);

  const email = user.email ?? "signed in";
  const ratingsById = Object.fromEntries(ratings);
  const tooShort = query.length > 0 && query.length < MIN_SEARCH_LENGTH;

  return (
    <AppShell
      email={email}
      displayName={displayNameFor(profile?.display_name ?? null, email)}
      avatarUrl={avatarUrl(profile?.avatar_path)}
      initials={initialsFor(profile?.display_name ?? null, email)}
    >
      <main className="page-container flex-1 pt-28 pb-24">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-bone sm:text-3xl">Search</h1>
          <div className="mt-5">
            <SearchField initialQuery={query} />
          </div>
        </div>

        <div className="mt-10">
          {query.length === 0 ? (
            <Hint>
              Type a title. For a film you can&rsquo;t name — a mood, a half-remembered
              plot — ask Kino instead.
            </Hint>
          ) : tooShort ? (
            <Hint>Keep going — {MIN_SEARCH_LENGTH} letters or more.</Hint>
          ) : results.movies.length === 0 ? (
            <NoResults query={query} />
          ) : (
            <>
              <p className="meta">
                {results.hasMore
                  ? `Showing the top ${RESULT_LIMIT} matches for “${query}”`
                  : `${results.movies.length} ${
                      results.movies.length === 1 ? "film" : "films"
                    } matching “${query}”`}
              </p>

              <div className="mt-5 flex flex-wrap gap-4">
                {results.movies.map((movie, index) => (
                  <PosterCard
                    key={movie.id}
                    movie={movie}
                    rating={ratingsById[movie.id] ?? null}
                    priority={index < 6}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="max-w-lg leading-relaxed text-bone-soft">{children}</p>;
}

/**
 * A failed title search is the best moment to offer the agent: the catalog may
 * well hold the film, just not under the words that were typed.
 */
function NoResults({ query }: { query: string }) {
  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold text-bone">
        No title matches “{query}”
      </h2>
      <p className="mt-2 leading-relaxed text-bone-soft">
        Check the spelling, or try fewer words. If you&rsquo;re describing a film
        rather than naming it, the agent searches by meaning instead.
      </p>
      <div className="mt-6">
        <AskAgentButton
          prompt={`I'm looking for a film: ${query}`}
          label="Ask Kino"
        />
      </div>
    </div>
  );
}
