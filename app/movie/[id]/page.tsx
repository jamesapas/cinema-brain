import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { AppShell } from "@/app/components/app-shell";
import { CarouselRow } from "@/app/components/carousel-row";
import { AskAboutButton } from "@/app/components/chat-overlay";
import { StarRating } from "@/app/components/star-rating";
import {
  getMovieById,
  getRatingsByMovie,
  getRelatedMovies,
} from "@/lib/movies/catalog";
import { backdropUrl, formatRuntime, posterUrl } from "@/lib/movies/images";
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
  const poster = posterUrl(movie.poster_path, "w500");
  const runtime = formatRuntime(movie.runtime);
  const votes =
    movie.vote_count && movie.vote_count > 0
      ? new Intl.NumberFormat("en-US").format(movie.vote_count)
      : null;

  const email = user.email ?? "signed in";

  return (
    <AppShell
      email={email}
      displayName={displayNameFor(profile?.display_name ?? null, email)}
      avatarUrl={avatarUrl(profile?.avatar_path)}
      initials={initialsFor(profile?.display_name ?? null, email)}
    >
      <main className="flex-1 pb-24">
        {/* Full width and running under the fixed header, like the home page's
            hero — the artwork is the one thing on the site that isn't in the
            page container. */}
        <div className="relative isolate w-full">
          {backdrop ? (
            <div className="relative aspect-[16/9] max-h-[68vh] w-full sm:aspect-[2.6/1]">
              <Image
                src={backdrop}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-top"
              />
              {/* Fades the artwork into the page rather than ending it on a
                  line. The top stop is held light on purpose: at 70% ink a
                  phone's short 16:9 band was almost entirely veil and the
                  artwork never showed. The header stays legible because it
                  fills itself past 24px of scroll. */}
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 via-58% to-ink/45" />
            </div>
          ) : (
            <div className="h-40 w-full bg-ink-raised sm:h-56" />
          )}
        </div>

        {/* Pulled up into the artwork, so the poster overlaps it the way it
            does on a streaming service rather than sitting in a band below. */}
        <div className="page-container relative -mt-20 sm:-mt-28 lg:-mt-36">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            {poster && (
              // self-start, or the flex row stretches the poster to the height
              // of the text column and the 2:3 is lost.
              <div className="relative aspect-[2/3] w-32 shrink-0 self-start overflow-hidden rounded-xl bg-ink-raised shadow-2xl ring-1 ring-ink-line sm:w-44 lg:w-52">
                <Image
                  src={poster}
                  alt={`${movie.title} poster`}
                  fill
                  sizes="(max-width: 640px) 8rem, (max-width: 1024px) 11rem, 13rem"
                  className="object-cover"
                />
              </div>
            )}

            <div className="min-w-0 flex-1 sm:pt-20 lg:pt-28">
              <h1 className="text-3xl leading-tight font-bold text-bone sm:text-4xl lg:text-5xl">
                {movie.title}
              </h1>

              <p className="meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {movie.release_year && <span>{movie.release_year}</span>}
                {runtime && <span>{runtime}</span>}
                {movie.vote_average !== null && (
                  <span className="inline-flex items-center gap-1 text-lamp">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
                        fill="currentColor"
                      />
                    </svg>
                    {movie.vote_average.toFixed(1)}
                    {votes && <span className="text-bone-dim">({votes})</span>}
                  </span>
                )}
              </p>

              {movie.tagline && (
                <p className="mt-5 text-[0.95rem] leading-snug text-lamp/90 italic">
                  {movie.tagline}
                </p>
              )}

              {movie.overview && (
                <p className="mt-5 max-w-2xl leading-relaxed text-bone-soft">
                  {movie.overview}
                </p>
              )}

              {movie.genres.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2">
                  {movie.genres.map((genre) => (
                    <li
                      key={genre}
                      className="rounded-full border border-ink-line px-3 py-1 text-xs font-medium text-bone-soft"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-5 border-t border-ink-line pt-7">
                <div className="flex flex-col gap-2">
                  <span className="label">Your rating</span>
                  <StarRating
                    movieId={movie.id}
                    rating={ratings.get(movie.id) ?? null}
                    size="lg"
                  />
                </div>
                <AskAboutButton title={movie.title} />
              </div>
            </div>
          </div>
        </div>

        {/* Omitted rather than shown empty: a film with no vector, or one whose
            neighbours all left the catalog, has nothing to say here. */}
        {related.length > 0 && (
          <div className="page-container pt-14 sm:pt-16">
            <CarouselRow
              title="More like this"
              note="found by meaning"
              movies={related}
              ratings={ratingsById}
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}
