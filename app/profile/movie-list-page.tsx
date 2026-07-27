import Link from "next/link";

import { AppShell } from "@/app/components/app-shell";
import { PosterCard } from "@/app/components/poster-card";
import { ProfileSidebar } from "@/app/components/profile-sidebar";
import { SignInPrompt } from "@/app/components/sign-in-prompt";
import { getViewer } from "@/lib/auth/viewer";
import { getRatingsByMovie } from "@/lib/movies/catalog";
import { getListMovies, type MovieList } from "@/lib/movies/lists";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The watchlist and favorites shelves.
 *
 * One component for both: they differ only in which rows they read and what
 * the empty state says, and two near-identical pages would have drifted the
 * first time either grid changed. The rail down the left is the same one the
 * overview uses, so all three read as the same place.
 */
export async function MovieListPage({
  list,
  heading,
  note,
  signedOut,
  empty,
}: {
  list: MovieList;
  heading: string;
  /** The line under the heading, once there's something to count. */
  note: (count: number) => string;
  signedOut: { heading: string; body: string; reason: string };
  empty: { heading: string; body: string };
}) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);

  if (!viewer) {
    return (
      <AppShell viewer={null}>
        <main className="page-container flex flex-1 items-center justify-center pt-28 pb-24">
          <SignInPrompt
            heading={signedOut.heading}
            body={signedOut.body}
            reason={signedOut.reason}
          />
        </main>
      </AppShell>
    );
  }

  const [movies, ratings] = await Promise.all([
    getListMovies(supabase, list),
    getRatingsByMovie(supabase),
  ]);

  return (
    <AppShell viewer={viewer}>
      <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
        <ProfileSidebar
          displayName={viewer.displayName}
          username={viewer.username}
          avatarUrl={viewer.avatarUrl}
          initials={viewer.initials}
        />

        <div className="mt-10 lg:mt-0">
          <header>
            <h1 className="text-2xl font-bold text-bone">{heading}</h1>
            <p className="meta mt-1">
              {movies.length === 0 ? "Nothing here yet" : note(movies.length)}
            </p>
          </header>

          {movies.length === 0 ? (
            <section className="mt-10 rounded-lg border border-ink-line bg-ink-raised px-6 py-10 text-center">
              <h2 className="text-xl font-bold text-bone">{empty.heading}</h2>
              <p className="mx-auto mt-2 max-w-md leading-relaxed text-bone-soft">
                {empty.body}
              </p>
              <Link href="/" className="btn btn-primary mt-6">
                Browse the catalog
              </Link>
            </section>
          ) : (
            // The overview's grid, down to the width override: a shelf of your
            // films should be the same shelf wherever you're standing.
            <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] [&>article]:w-full">
              {movies.map((movie) => (
                <PosterCard
                  key={movie.id}
                  movie={movie}
                  rating={ratings.get(movie.id) ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
