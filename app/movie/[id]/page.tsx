import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AppShell } from "@/app/components/app-shell";
import { CastRow } from "@/app/components/cast-row";
import { CarouselRow } from "@/app/components/carousel-row";
import { AskAboutButton } from "@/app/components/chat-overlay";
import { ListButtons } from "@/app/components/movie-lists";
import { MovieMeta } from "@/app/components/movie-meta";
import { MovieOverview } from "@/app/components/movie-overview";
import { StarRating } from "@/app/components/star-rating";
import { TrailerButton } from "@/app/components/trailer-button";
import {
  getMovieById,
  getMovieCast,
  getMovieTrailerKey,
  getRatingsByMovie,
  getRelatedMovies,
} from "@/lib/movies/catalog";
import { backdropUrl } from "@/lib/movies/images";
import { getViewer } from "@/lib/auth/viewer";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * One film, on its own URL.
 */

type PageProps = { params: Promise<{ id: string }> };

/** Ids come off the URL as strings, and anything can be typed into a URL. */
function parseMovieId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * `cache` so the page and its metadata share one query.
 */
const loadMovie = cache(async (id: number) => {
  const supabase = await createServerSupabase();
  return getMovieById(supabase, id);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseMovieId((await params).id);
  const movie = id === null ? null : await loadMovie(id);
  if (!movie) return { title: "Film not found" };

  const year = movie.release_year ? ` (${movie.release_year})` : "";
  return {
    title: `${movie.title}${year}`,
    description: movie.tagline ?? movie.overview ?? undefined,
  };
}

export default async function MoviePage({ params }: PageProps) {
  const id = parseMovieId((await params).id);
  if (id === null) notFound();

  const supabase = await createServerSupabase();

  // Collapsed all queries into the primary Promise.all so movie data, rating state,
  // trailer key, cast, and related shelf resolve concurrently in parallel.
  // This guarantees a single, instant transition from loading.tsx to full page.
  const [movie, viewer, ratingsRaw, trailerKey, cast, related] = await Promise.all([
    loadMovie(id),
    getViewer(supabase),
    getRatingsByMovie(supabase),
    getMovieTrailerKey(id),
    getMovieCast(id),
    getRelatedMovies(supabase, id),
  ]);

  if (!movie) notFound();

  const ratings = viewer ? ratingsRaw : new Map<number, number>();
  const ratingsById = Object.fromEntries(ratings);
  const backdrop = backdropUrl(movie.backdrop_path);

  return (
    <AppShell viewer={viewer}>
      <main className="flex-1 pb-24">
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

          <div className="absolute inset-0 bg-gradient-to-r from-ink from-10% via-ink/55 via-55% to-transparent to-88%" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 via-32% to-transparent to-72%" />

          <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
            <div className="max-w-3xl">
              <h1 className="text-2xl leading-tight font-bold text-bone sm:text-4xl lg:text-5xl">
                {movie.title}
              </h1>

              <MovieMeta movie={movie} className="mt-2 sm:mt-3" />

              {movie.tagline && (
                <p className="mt-2 text-xs leading-snug text-lamp/90 italic sm:mt-3 sm:text-[0.95rem]">
                  {movie.tagline}
                </p>
              )}

              {movie.overview && <MovieOverview overview={movie.overview} />}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 sm:mt-6">
                <AskAboutButton title={movie.title} />
                <TrailerButton movieTitle={movie.title} youtubeKey={trailerKey} />
                <ListButtons movieId={movie.id} variant="hero" />
                <div className="h-6 w-px bg-ink-line hidden sm:block" />
                <StarRating
                  movieId={movie.id}
                  rating={ratings.get(movie.id) ?? null}
                  size="xl"
                  showValue
                />
              </div>
            </div>
          </div>
        </section>

        {cast.length > 0 && (
          <div className="page-container pt-12 sm:pt-14">
            <h2 className="mb-4 text-lg font-bold text-bone sm:text-xl">Cast</h2>
            <CastRow items={cast} />
          </div>
        )}

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


