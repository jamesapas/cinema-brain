import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/app-shell";
import { CarouselRow } from "@/app/components/carousel-row";
import { Hero } from "@/app/components/hero";
import {
  getBecauseYouRated,
  getByGenre,
  getRatingsByMovie,
  getTopRated,
  getTrending,
} from "@/lib/movies/catalog";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getProfile } from "@/lib/profiles/queries";
import { createServerSupabase } from "@/lib/supabase/server";

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

export default async function Home() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already gates this, but a page rendering a signed-in shell
  // shouldn't depend on that alone.
  if (!user) redirect("/login");

  const [trending, topRated, ratings, personalized, profile] = await Promise.all([
    getTrending(supabase, 20),
    getTopRated(supabase, { limit: 20 }),
    getRatingsByMovie(supabase),
    getBecauseYouRated(supabase, 20),
    getProfile(supabase),
  ]);

  // Genres for the rated films, to pick a shelf that matches their taste.
  const ratedIds = [...ratings.keys()];
  const { data: ratedRows } = ratedIds.length
    ? await supabase.from("movies").select("id, genres").in("id", ratedIds)
    : { data: [] };
  const genresByMovie = new Map((ratedRows ?? []).map((row) => [row.id, row.genres]));

  const genre = favouriteGenre(ratings, genresByMovie) ?? "Science Fiction";
  const genreRow = await getByGenre(supabase, genre, 20);

  // The featured slot rotates through what's trending, and keeps films you've
  // already rated rather than skipping them — your score shows on the stars.
  // Only films with a backdrop qualify; the hero is mostly its artwork.
  const heroMovies = trending.filter((movie) => movie.backdrop_path).slice(0, 6);

  const ratingsById = Object.fromEntries(ratings);

  const email = user.email ?? "signed in";

  return (
    <AppShell
      email={email}
      displayName={displayNameFor(profile?.display_name ?? null, email)}
      avatarUrl={avatarUrl(profile?.avatar_path)}
      initials={initialsFor(profile?.display_name ?? null, email)}
    >
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
          {personalized && (
            <CarouselRow
              title={`Because you rated ${personalized.seed.title}`}
              movies={personalized.movies}
              ratings={ratingsById}
              priority
            />
          )}

          <CarouselRow
            title="Trending"
            movies={trending}
            ratings={ratingsById}
            priority={!personalized}
          />

          <CarouselRow
            title="Top rated"
            note="500+ votes"
            movies={topRated}
            ratings={ratingsById}
          />

          <CarouselRow title={genre} movies={genreRow} ratings={ratingsById} />
        </div>
      </main>
    </AppShell>
  );
}
