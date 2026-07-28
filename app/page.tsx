import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/app/components/app-shell";
import { CarouselRow } from "@/app/components/carousel-row";
import { Hero } from "@/app/components/hero";
import { getViewer } from "@/lib/auth/viewer";
import {
  getByGenre,
  getRatingsByMovie,
  getRatedMovies,
  getTopPicksForYou,
  getTopRated,
  getTrending,
} from "@/lib/movies/catalog";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** The genre shelf follows the user's taste when there is any to follow. */
function favouriteGenre(
  ratings: Map<number, number>,
  genresByMovie: Map<number, string[]>,
): string | null {
  const counts = new Map<string, number>();
  for (const [movieId, rating] of ratings) {
    if (rating < 7) continue;
    for (const genre of genresByMovie.get(movieId) ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [genre, count] of counts) {
    if (count > bestCount) {
      best = genre;
      bestCount = count;
    }
  }
  return best;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase sometimes sends the OAuth `?code=` to the Site URL (root) instead
  // of the intended `/auth/callback` when the redirect URL list doesn't match
  // the path exactly. Forward it to the real handler rather than leaving the
  // user staring at the catalog with no session.
  const { code } = await searchParams;
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  const supabase = await createServerSupabase();

  // Trending and Top Rated are served from Next.js's `unstable_cache` and cost
  // no network round trip. The light ratings query gives the hero and both
  // shelves immediate star state without waiting for the Pinecone round-trip
  // that personalisation requires.
  const [viewer, trending, topRated, ratingsRaw] = await Promise.all([
    getViewer(supabase),
    getTrending(supabase, 20),
    getTopRated(supabase, { limit: 20 }),
    getRatingsByMovie(supabase),
  ]);

  const heroMovies = trending.filter((movie) => movie.backdrop_path).slice(0, 6);
  const ratingsById = Object.fromEntries(ratingsRaw);

  return (
    <AppShell viewer={viewer}>
      <main className="flex-1 pb-24">
        {/* Outside the container on purpose: the backdrop is the one full-width
            thing on the page. */}
        {heroMovies.length > 0 && (
          <Hero movies={heroMovies} ratings={ratingsById} />
        )}

        {/* Without a hero the shelves start at the top, so they need clearance
            for the fixed header of their own. */}
        <div
          className={`page-container flex flex-col gap-2 ${
            heroMovies.length > 0 ? "pt-6" : "pt-28"
          }`}
        >
          {/* Top Picks for You streams right below the hero banner. Fast cached
              reads show immediately; fresh lookups stream seamlessly. */}
          <Suspense fallback={<ShelfSkeleton />}>
            <TopPicksShelf viewerId={viewer?.id ?? null} />
          </Suspense>

          {/* Catalog shelves served from cache */}
          <CarouselRow
            title="Trending"
            movies={trending}
            ratings={ratingsById}
            priority
          />

          <CarouselRow
            title="Top rated"
            note="500+ votes"
            movies={topRated}
            ratings={ratingsById}
          />

          {/* Favourite genre shelf */}
          <Suspense fallback={<ShelfSkeleton />}>
            <GenreShelf viewerId={viewer?.id ?? null} />
          </Suspense>
        </div>
      </main>
    </AppShell>
  );
}

// ─── streaming components ─────────────────────────────────────────────────────

/**
 * "Top Picks for You" shelf — rendered as the top shelf right below the Hero.
 * Cached per user with `unstable_cache` (revalidate: 900) for instant renders.
 */
async function TopPicksShelf({ viewerId }: { viewerId: string | null }) {
  if (!viewerId) return null;

  const supabase = await createServerSupabase();
  const [ratedMovies, topPicks] = await Promise.all([
    getRatedMovies(supabase, viewerId),
    getTopPicksForYou(supabase, viewerId, 20),
  ]);

  if (!topPicks || topPicks.movies.length === 0) return null;

  const ratings = new Map(ratedMovies.map((r) => [r.movie.id, r.rating]));
  const ratingsById = Object.fromEntries(ratings);

  return (
    <CarouselRow
      title="Top Picks for You"
      note={topPicks.tasteSummary ?? undefined}
      movies={topPicks.movies}
      ratings={ratingsById}
      priority
    />
  );
}

/**
 * User's Favourite Genre shelf — rendered at the bottom of the home catalog.
 */
async function GenreShelf({ viewerId }: { viewerId: string | null }) {
  const supabase = await createServerSupabase();

  if (!viewerId) {
    const genreRow = await getByGenre(supabase, "Science Fiction", 20);
    return <CarouselRow title="Science Fiction" movies={genreRow} ratings={{}} />;
  }

  const ratedMovies = await getRatedMovies(supabase, viewerId);
  const ratings = new Map(ratedMovies.map((r) => [r.movie.id, r.rating]));
  const genresByMovie = new Map(ratedMovies.map((r) => [r.movie.id, r.movie.genres]));
  const genre = favouriteGenre(ratings, genresByMovie) ?? "Science Fiction";
  const genreRow = await getByGenre(supabase, genre, 20);
  const ratingsById = Object.fromEntries(ratings);

  return <CarouselRow title={genre} movies={genreRow} ratings={ratingsById} />;
}

// ─── skeletons ───────────────────────────────────────────────────────────────

function ShelfSkeleton() {
  return (
    <section className="group/row">
      <div className="mb-3 flex items-baseline gap-3">
        <div className="skeleton h-5 w-36 rounded sm:h-6" />
      </div>
      <div className="flex gap-3 overflow-hidden pt-1 pb-4 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-[8rem] shrink-0 sm:w-[12.5rem] lg:w-[14rem]"
          >
            {/* Poster image aspect 2/3 */}
            <div className="skeleton aspect-[2/3] w-full rounded-lg" />
            {/* Title & meta placeholders matching real PosterCard flow */}
            <div className="mt-2 space-y-1 sm:mt-2.5">
              <div className="skeleton h-3.5 w-3/4 rounded sm:h-4" />
              <div className="skeleton h-3 w-1/2 rounded" />
              <div className="mt-1.5 skeleton h-4 w-24 rounded sm:mt-2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Two shelf placeholders: Top Picks + Genre shelf */
function PersonalisedShelfSkeleton() {
  return (
    <>
      <ShelfSkeleton />
      <ShelfSkeleton />
    </>
  );
}
