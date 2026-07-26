import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { AppShell } from "@/app/components/app-shell";
import { CarouselRow } from "@/app/components/carousel-row";
import { AskAboutButton } from "@/app/components/chat-overlay";
import { MovieMeta } from "@/app/components/movie-meta";
import { StarRating } from "@/app/components/star-rating";
import {
  getMovieById,
  getRatingsByMovie,
  getRelatedMovies,
} from "@/lib/movies/catalog";
import { backdropUrl } from "@/lib/movies/images";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { getProfile } from "@/lib/profiles/queries";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * One film, on its own URL.
 *
 * This replaced a dialog over the catalog. The dialog existed because a route
 * was assumed to cost you your scroll position, which turned out not to be
 * true — `<Link>` maintains it the way the browser does on back. What the
 * dialog could never have is a shelf of other films inside it, which is what
 * "More like this" is.
 */

type PageProps = { params: Promise<{ id: string }> };

/** Ids come off the URL as strings, and anything can be typed into a URL. */
function parseMovieId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * `cache` so the page and its metadata share one query. Next dedupes `fetch`
 * automatically, but a Supabase call is not a `fetch` it can see.
 */
const loadMovie = cache(async (id: number) => {
  const supabase = await createServerSupabase();
  return getMovieById(supabase, id);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseMovieId((await params).id);
  const movie = id === null ? null : await loadMovie(id);
  if (!movie) return { title: "Film not found · Cinema Brain" };

  const year = movie.release_year ? ` (${movie.release_year})` : "";
  return {
    title: `${movie.title}${year} · Cinema Brain`,
    description: movie.tagline ?? movie.overview ?? undefined,
  };
}

export default async function MoviePage({ params }: PageProps) {
  const id = parseMovieId((await params).id);
  if (id === null) notFound();

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All four together, including the related films: waiting to see whether the
  // film exists before starting the vector query would put Pinecone's round
  // trip in series on every valid page, to save one read unit on the rare
  // invalid one.
  const [movie, related, ratings, profile] = await Promise.all([
    loadMovie(id),
    getRelatedMovies(supabase, id),
    getRatingsByMovie(supabase),
    getProfile(supabase),
  ]);

  if (!movie) notFound();

  const ratingsById = Object.fromEntries(ratings);
  const backdrop = backdropUrl(movie.backdrop_path);

  const email = user.email ?? "signed in";

  return (
    <AppShell
      email={email}
      displayName={displayNameFor(profile?.display_name ?? null, email)}
      avatarUrl={avatarUrl(profile?.avatar_path)}
      initials={initialsFor(profile?.display_name ?? null, email)}
    >
      <main className="flex-1 pb-24">
        {/* The same slot the home page's hero occupies, down to the two
            gradients: a film should not open into a differently shaped page
            than the one that sent you here. The artwork bleeds full width and
            runs under the fixed header; everything on top of it stays in the
            page container. */}
        <section className="relative isolate min-h-[62vh] w-full overflow-hidden sm:min-h-[70vh]">
          {backdrop && (
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
          )}

          {/* Held dark under the copy and dropped early, so the right of the
              frame is still the film. The hero's stops, carried a little
              further across (55% / 88% rather than 42% / 78%) because without
              a poster the writing now reaches `max-w-3xl` — the ink has to
              cover what the poster used to. */}
          <div className="absolute inset-0 bg-gradient-to-r from-ink from-10% via-ink/55 via-55% to-transparent to-88%" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 via-32% to-transparent to-72%" />

          <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
            {/* No poster. The backdrop is already this film's picture, and a
                poster beside it only bought a second image at the cost of the
                width the writing needed. `max-w-3xl` is the readable end of
                that width — the gradient below is tuned to hold ink that far
                across so the overview never runs onto bright artwork. */}
            <div className="max-w-3xl">
              <h1 className="text-3xl leading-[1.05] font-bold text-bone sm:text-4xl lg:text-5xl">
                {movie.title}
              </h1>

              <MovieMeta movie={movie} className="mt-3" />

              {movie.tagline && (
                <p className="mt-4 text-[0.95rem] leading-snug text-lamp/90 italic">
                  {movie.tagline}
                </p>
              )}

              {/*
                Rating comes before the synopsis, not after it.

                Rating films is what this site is for — the catalog and Kino
                both run on the scores collected here — so the control that
                does it is the first thing under the title rather than a
                footnote below the copy.

                Nothing frames it: a card on top of a photograph has to be dark
                enough to survive a bright frame, which makes it a black slab on
                a dark one, and it drew a box instead of drawing the eye. The
                stars carry it alone — 32px, gold, the only thing on the page at
                that size — with the score beside them in place of a heading.
              */}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-5">
                  <AskAboutButton title={movie.title} />
                  <StarRating
                    movieId={movie.id}
                    rating={ratings.get(movie.id) ?? null}
                    size="xl"
                    showValue
                  />
              </div>

              {movie.overview && (
                <p className="mt-6 leading-relaxed text-bone-soft">{movie.overview}</p>
              )}
            </div>
          </div>
        </section>

        {/* Omitted rather than shown empty: a film with no vector, or one whose
            neighbours all left the catalog, has nothing to say here. */}
        {related.length > 0 && (
          <div className="page-container pt-14 sm:pt-16">
            <CarouselRow
              title="More like this"
              movies={related}
              ratings={ratingsById}
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}
