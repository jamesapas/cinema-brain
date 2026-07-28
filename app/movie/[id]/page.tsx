import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { AppShell } from "@/app/components/app-shell";
import { CarouselRow } from "@/app/components/carousel-row";
import { AskAboutButton } from "@/app/components/chat-overlay";
import { ListButtons } from "@/app/components/movie-lists";
import { MovieMeta } from "@/app/components/movie-meta";
import { StarRating } from "@/app/components/star-rating";
import {
  getMovieById,
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

  // Collapsed getRatingsByMovie into the primary Promise.all so the rating
  // state resolves alongside movie data and viewer identity in parallel.
  const [movie, viewer, ratingsRaw] = await Promise.all([
    loadMovie(id),
    getViewer(supabase),
    getRatingsByMovie(supabase),
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
              <h1 className="text-3xl leading-[1.05] font-bold text-bone sm:text-4xl lg:text-5xl">
                {movie.title}
              </h1>

              <MovieMeta movie={movie} className="mt-3" />

              {movie.tagline && (
                <p className="mt-4 text-[0.95rem] leading-snug text-lamp/90 italic">
                  {movie.tagline}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-5">
                <AskAboutButton title={movie.title} />
                <StarRating
                  movieId={movie.id}
                  rating={ratings.get(movie.id) ?? null}
                  size="xl"
                  showValue
                />
              </div>

              <div className="mt-5">
                <ListButtons movieId={movie.id} variant="inline" />
              </div>

              {movie.overview && (
                <p className="mt-6 leading-relaxed text-bone-soft">{movie.overview}</p>
              )}
            </div>
          </div>
        </section>

        {/* Vector recommendation shelf streams independently so Pinecone
            lookups never delay the primary film details. */}
        <Suspense fallback={<RelatedSkeleton />}>
          <RelatedMoviesShelf movieId={movie.id} ratingsById={ratingsById} />
        </Suspense>
      </main>
    </AppShell>
  );
}

// ─── streaming components ─────────────────────────────────────────────────────

async function RelatedMoviesShelf({
  movieId,
  ratingsById,
}: {
  movieId: number;
  ratingsById: Record<number, number>;
}) {
  const supabase = await createServerSupabase();
  const related = await getRelatedMovies(supabase, movieId);

  if (related.length === 0) return null;

  return (
    <div className="page-container pt-14 sm:pt-16">
      <CarouselRow
        title="More like this"
        movies={related}
        ratings={ratingsById}
      />
    </div>
  );
}

function RelatedSkeleton() {
  return (
    <div className="page-container pt-14 sm:pt-16">
      <section className="group/row">
        <div className="mb-3 flex items-baseline gap-3">
          <div className="skeleton h-5 w-36 rounded sm:h-6" />
        </div>
        <div className="flex gap-3 overflow-hidden pt-1 pb-4 sm:gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="w-[8rem] shrink-0 sm:w-[12.5rem] lg:w-[14rem]"
            >
              <div className="skeleton aspect-[2/3] w-full rounded-lg" />
              <div className="mt-2 space-y-1 sm:mt-2.5">
                <div className="skeleton h-3.5 w-3/4 rounded sm:h-4" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="mt-1.5 skeleton h-4 w-24 rounded sm:mt-2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
