import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MovieInsert } from "@/lib/database.types";
import {
  buildEmbeddingInput,
  hashEmbeddingInput,
} from "@/lib/movies/embedding-input";
import {
  TmdbError,
  discoverMovies,
  getChangedMovieIds,
  getMovieDetails,
  mapWithConcurrency,
  type DiscoverOptions,
  type TmdbMovieDetails,
} from "@/lib/tmdb";

const UPSERT_CHUNK_SIZE = 200;
const DETAIL_CONCURRENCY = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * Returns how many rows now need embedding, and how many of them were new.
 */
async function upsertBatch(
  supabase: SupabaseClient<Database>,
  rows: MovieInsert[],
): Promise<{ needsEmbedding: number; inserted: number }> {
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

  return {
    needsEmbedding: stale.length,
    inserted: rows.length - existingById.size,
  };
}

/**
 * Fetches one discover page, hydrates each movie's details, and upserts them.
 * Returns the discover response so the caller can read `total_pages`.
 */
async function syncOnePage(
  supabase: SupabaseClient<Database>,
  discoverOptions: DiscoverOptions,
  page: number,
  result: SyncResult,
  onProgress: (message: string) => void,
) {
  const discovered = await discoverMovies({ ...discoverOptions, page });
  result.pagesFetched++;
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
    const { needsEmbedding } = await upsertBatch(supabase, batch);
    result.needsEmbedding += needsEmbedding;
    result.moviesUpserted += batch.length;
  }

  return { discovered, upserted: rows.length };
}

function emptyResult(): SyncResult {
  return {
    pagesFetched: 0,
    moviesSeen: 0,
    moviesUpserted: 0,
    needsEmbedding: 0,
    skipped: 0,
  };
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
  const result = emptyResult();

  // Pin the window so later pages can't shift under us as popularity changes
  // mid-run, which would otherwise duplicate or skip titles.
  const releasedBefore = new Date().toISOString().slice(0, 10);
  const discoverOptions: DiscoverOptions = { sortBy, minVoteCount, releasedBefore };

  for (let offset = 0; offset < pages; offset++) {
    const page = startPage + offset;

    // Peek before committing to the work: a page past the end returns nothing
    // useful and we'd rather say so than silently loop.
    const { discovered, upserted } = await syncOnePage(
      supabase,
      discoverOptions,
      page,
      result,
      onProgress,
    );

    if (page > discovered.total_pages) {
      onProgress(`page ${page} is past the last page (${discovered.total_pages}) — stopping`);
      break;
    }

    onProgress(
      `page ${page}/${Math.min(startPage + pages - 1, discovered.total_pages)}: ` +
        `${upserted} movies upserted`,
    );
  }

  return result;
}

const CHANGES_BATCH_SIZE = 40;
const CHANGES_BATCH_DELAY_MS = 250;

export type ChangesSyncOptions = {
  /** How far back to ask TMDB for changes. TMDB caps the window at 14 days. */
  days?: number;
  /**
   * Vote floor for *new* titles only. The changes feed is unfiltered, so ~60% of
   * a day's ids are films the discover sync deliberately never pulled — mostly
   * zero-vote entries that would otherwise land in the catalog (and the embedding
   * queue) at a few thousand a day. Rows already in the catalog are always
   * refreshed, whatever their vote count.
   */
  minVoteCount?: number;
  onProgress?: (message: string) => void;
};

export type ChangesSyncResult = {
  changedIds: number;
  inserted: number;
  updated: number;
  /** New titles held back by `minVoteCount`. */
  skipped: number;
  failed: number;
  needsEmbedding: number;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Syncs only the movies TMDB reports as changed, instead of walking the catalog.
 *
 * Most entries in the changes feed are vote/popularity movement on old films, so
 * the refresh writes vote_average, vote_count and popularity on update as well
 * as insert — that is the whole point of the daily run. The embedding input
 * (title/year/genres/tagline/overview) usually hasn't moved, so `upsertBatch`
 * leaves `embedded_at` alone and only the genuinely re-worded rows get queued.
 */
export async function syncChangedMovies(
  supabase: SupabaseClient<Database>,
  { days = 1, minVoteCount = 10, onProgress = () => {} }: ChangesSyncOptions = {},
): Promise<ChangesSyncResult> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const ids = await getChangedMovieIds({
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
  });

  const result: ChangesSyncResult = {
    changedIds: ids.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    needsEmbedding: 0,
  };

  const batches = chunk(ids, CHANGES_BATCH_SIZE);

  for (const [index, batch] of batches.entries()) {
    const details = await mapWithConcurrency(batch, DETAIL_CONCURRENCY, async (id) => {
      try {
        return await getMovieDetails(id);
      } catch (error) {
        // 404s are withdrawn titles; anything else already exhausted its
        // retries inside the client. Either way one bad id shouldn't end the run.
        onProgress(
          `skipping ${id}: ${error instanceof TmdbError ? `TMDB ${error.status}` : error}`,
        );
        return null;
      }
    });

    const fetched = details.filter((entry): entry is TmdbMovieDetails => entry !== null);
    result.failed += batch.length - fetched.length;

    // Which of these we already hold decides whether the vote floor applies.
    const { data: known, error: knownError } = await supabase
      .from("movies")
      .select("id")
      .in(
        "id",
        fetched.map((entry) => entry.id),
      );

    if (knownError) {
      throw new Error(`Failed to read existing movies: ${knownError.message}`);
    }

    const knownIds = new Set(known?.map((row) => row.id) ?? []);

    const rows = fetched
      .filter((entry) => {
        if (knownIds.has(entry.id)) return true;
        if ((entry.vote_count ?? 0) >= minVoteCount) return true;
        result.skipped++;
        return false;
      })
      .map(mapDetailsToRow);

    if (rows.length > 0) {
      const { needsEmbedding, inserted } = await upsertBatch(supabase, rows);
      result.needsEmbedding += needsEmbedding;
      result.inserted += inserted;
      result.updated += rows.length - inserted;
    }

    // Spacing the batches keeps the run comfortably under TMDB's rate limit.
    if (index < batches.length - 1) await sleep(CHANGES_BATCH_DELAY_MS);
  }

  return result;
}

/** TMDB refuses any page above this, whatever the result count says. */
const MAX_DISCOVER_PAGE = 500;

export type YearSyncOptions = {
  fromYear: number;
  toYear: number;
  minVoteCount?: number;
  onProgress?: (message: string) => void;
  /** Called after each year finishes, so a long run can report as it goes. */
  onYearDone?: (year: number, result: SyncResult) => void;
};

/**
 * Syncs a range of release years, newest first.
 *
 * One discover query per year, which is what gets the catalog past TMDB's
 * 500-page ceiling: the ceiling applies per query, and no single year comes
 * close to it at any sane vote threshold. Newest first so an interrupted run
 * still leaves the films people are most likely to look for.
 *
 * Interrupted runs resume by re-running with `--to-year` set to the year it
 * stopped on; the upsert is keyed on TMDB's id, so overlap costs time, not
 * correctness.
 */
export async function syncMoviesByYear(
  supabase: SupabaseClient<Database>,
  { fromYear, toYear, minVoteCount = 10, onProgress = () => {}, onYearDone = () => {} }: YearSyncOptions,
): Promise<SyncResult> {
  const total = emptyResult();
  const releasedBefore = new Date().toISOString().slice(0, 10);

  for (let year = toYear; year >= fromYear; year--) {
    const yearResult = emptyResult();
    const discoverOptions: DiscoverOptions = {
      minVoteCount,
      releasedBefore,
      primaryReleaseYear: year,
    };

    // Page 1 tells us how many there are; the rest follow.
    const first = await syncOnePage(supabase, discoverOptions, 1, yearResult, onProgress);
    const pages = Math.min(first.discovered.total_pages, MAX_DISCOVER_PAGE);

    for (let page = 2; page <= pages; page++) {
      await syncOnePage(supabase, discoverOptions, page, yearResult, onProgress);
    }

    if (first.discovered.total_pages > MAX_DISCOVER_PAGE) {
      onProgress(
        `${year}: ${first.discovered.total_results} results exceed the ${MAX_DISCOVER_PAGE}-page ` +
          `cap — ${(first.discovered.total_pages - MAX_DISCOVER_PAGE) * 20} not reachable`,
      );
    }

    total.pagesFetched += yearResult.pagesFetched;
    total.moviesSeen += yearResult.moviesSeen;
    total.moviesUpserted += yearResult.moviesUpserted;
    total.needsEmbedding += yearResult.needsEmbedding;
    total.skipped += yearResult.skipped;

    onYearDone(year, yearResult);
  }

  return total;
}
