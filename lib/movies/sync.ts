import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MovieInsert } from "@/lib/database.types";
import {
  buildEmbeddingInput,
  hashEmbeddingInput,
} from "@/lib/movies/embedding-input";
import {
  TmdbError,
  discoverMovies,
  getMovieDetails,
  mapWithConcurrency,
  type DiscoverOptions,
  type TmdbMovieDetails,
} from "@/lib/tmdb";

const UPSERT_CHUNK_SIZE = 200;
const DETAIL_CONCURRENCY = 8;

export type SyncOptions = {
  pages?: number;
  startPage?: number;
  minVoteCount?: number;
  sortBy?: string;
  onProgress?: (message: string) => void;
};

export type SyncResult = {
  pagesFetched: number;
  moviesSeen: number;
  moviesUpserted: number;
  needsEmbedding: number;
  skipped: number;
};

/** TMDB detail response -> `movies` row. Never sets the generated release_year. */
export function mapDetailsToRow(details: TmdbMovieDetails): MovieInsert {
  const releaseDate = details.release_date?.trim() ? details.release_date : null;
  const genres = details.genres.map((genre) => genre.name);

  const embeddingInput = buildEmbeddingInput({
    title: details.title,
    release_year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    genres,
    tagline: details.tagline?.trim() ? details.tagline : null,
    overview: details.overview?.trim() ? details.overview : null,
  });

  // Every nullable field gets an explicit null: PostgREST derives the upsert
  // column list from the union of payload keys, so a dropped `undefined` in one
  // row would null that column out for the rest of the batch.
  return {
    id: details.id,
    title: details.title,
    original_title: details.original_title ?? null,
    original_language: details.original_language ?? null,
    overview: details.overview?.trim() ? details.overview : null,
    tagline: details.tagline?.trim() ? details.tagline : null,
    release_date: releaseDate,
    runtime: details.runtime && details.runtime > 0 ? details.runtime : null,
    genres,
    status: details.status ?? null,
    adult: details.adult ?? false,
    popularity: details.popularity ?? null,
    vote_average: details.vote_average ?? null,
    vote_count: details.vote_count ?? null,
    poster_path: details.poster_path ?? null,
    backdrop_path: details.backdrop_path ?? null,
    imdb_id: details.imdb_id ?? null,
    embedding_input_hash: hashEmbeddingInput(embeddingInput),
    synced_at: new Date().toISOString(),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Upserts a batch, clearing `embedded_at` only for rows whose embedding input
 * actually changed. That keeps a routine popularity/vote refresh from queueing
 * the whole catalog for re-embedding.
 *
 * Returns how many rows now need embedding.
 */
async function upsertBatch(
  supabase: SupabaseClient<Database>,
  rows: MovieInsert[],
): Promise<number> {
  const { data: existing, error: selectError } = await supabase
    .from("movies")
    .select("id, embedding_input_hash, embedded_at")
    .in(
      "id",
      rows.map((row) => row.id),
    );

  if (selectError) {
    throw new Error(`Failed to read existing movies: ${selectError.message}`);
  }

  const existingById = new Map(existing?.map((row) => [row.id, row]) ?? []);

  const stale: MovieInsert[] = [];
  const fresh: MovieInsert[] = [];

  for (const row of rows) {
    const prior = existingById.get(row.id);
    const alreadyEmbedded =
      prior != null &&
      prior.embedded_at !== null &&
      prior.embedding_input_hash === row.embedding_input_hash;
    (alreadyEmbedded ? fresh : stale).push(row);
  }

  // Two separate calls because the payloads have different column lists:
  // `stale` resets embedded_at, `fresh` must leave it untouched.
  if (stale.length > 0) {
    const { error } = await supabase
      .from("movies")
      .upsert(
        stale.map((row) => ({ ...row, embedded_at: null })),
        { onConflict: "id" },
      );
    if (error) throw new Error(`Failed to upsert movies: ${error.message}`);
  }

  if (fresh.length > 0) {
    const { error } = await supabase.from("movies").upsert(fresh, { onConflict: "id" });
    if (error) throw new Error(`Failed to upsert movies: ${error.message}`);
  }

  return stale.length;
}

export async function syncMovies(
  supabase: SupabaseClient<Database>,
  {
    pages = 5,
    startPage = 1,
    minVoteCount = 100,
    sortBy = "popularity.desc",
    onProgress = () => {},
  }: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    pagesFetched: 0,
    moviesSeen: 0,
    moviesUpserted: 0,
    needsEmbedding: 0,
    skipped: 0,
  };

  // Pin the window so later pages can't shift under us as popularity changes
  // mid-run, which would otherwise duplicate or skip titles.
  const releasedBefore = new Date().toISOString().slice(0, 10);
  const discoverOptions: DiscoverOptions = { sortBy, minVoteCount, releasedBefore };

  for (let offset = 0; offset < pages; offset++) {
    const page = startPage + offset;
    const discovered = await discoverMovies({ ...discoverOptions, page });
    result.pagesFetched++;

    if (page > discovered.total_pages) {
      onProgress(`page ${page} is past the last page (${discovered.total_pages}) — stopping`);
      break;
    }

    result.moviesSeen += discovered.results.length;

    // Details give us runtime, tagline, imdb_id and genre names, which the
    // discover response omits.
    const details = await mapWithConcurrency(
      discovered.results,
      DETAIL_CONCURRENCY,
      async (movie) => {
        try {
          return await getMovieDetails(movie.id);
        } catch (error) {
          if (error instanceof TmdbError && error.isNotFound) {
            onProgress(`skipping ${movie.id} (${movie.title}): not found on TMDB`);
            return null;
          }
          throw error;
        }
      },
    );

    const rows = details
      .filter((entry): entry is TmdbMovieDetails => entry !== null)
      .map(mapDetailsToRow);

    result.skipped += discovered.results.length - rows.length;

    for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
      result.needsEmbedding += await upsertBatch(supabase, batch);
      result.moviesUpserted += batch.length;
    }

    onProgress(
      `page ${page}/${Math.min(startPage + pages - 1, discovered.total_pages)}: ` +
        `${rows.length} movies upserted`,
    );
  }

  return result;
}
