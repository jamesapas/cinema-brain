/**
 * Populates the shared `movies` catalog from TMDB.
 *
 * Page mode — a window of one popularity-sorted query, capped by TMDB at 500
 * pages (10,000 films):
 *
 *   npm run sync:movies -- --pages=5 --start-page=1 --min-votes=100
 *
 * Year mode — one query per release year, newest first, which is how the
 * catalog grows past that cap:
 *
 *   npm run sync:movies -- --from-year=1900 --to-year=2026 --min-votes=10
 *
 * Runs outside the Next.js runtime, so .env* files are loaded explicitly with
 * @next/env (the same loader Next uses, so precedence matches the app).
 *
 * The imports below are safe to hoist above loadEnvConfig because lib/env.ts
 * reads process.env through lazy getters — nothing touches env at module load.
 */

import { loadEnvConfig } from "@next/env";

import { syncMovies, syncMoviesByYear, type SyncResult } from "@/lib/movies/sync";
import { createAdminClient } from "@/lib/supabase/admin";

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function optionalNumericFlag(name: string): number | undefined {
  return process.argv.some((arg) => arg.startsWith(`--${name}=`))
    ? numericFlag(name, 0)
    : undefined;
}

async function main() {
  loadEnvConfig(process.cwd());

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const fromYear = optionalNumericFlag("from-year");
  const toYear = optionalNumericFlag("to-year");

  // Year mode: one discover query per release year, which is the only way past
  // TMDB's 500-page-per-query ceiling. Any single year fits inside it.
  if (fromYear !== undefined || toYear !== undefined) {
    const from = fromYear ?? 1900;
    const to = toYear ?? new Date().getUTCFullYear();
    const minVoteCount = numericFlag("min-votes", 10);

    if (from > to) throw new Error(`--from-year (${from}) must not exceed --to-year (${to})`);

    console.log(
      `Syncing TMDB by year, ${to} down to ${from} (min ${minVoteCount} votes)...\n` +
        `If this is interrupted, resume with --to-year=<the year it stopped on>.\n`,
    );

    const yearResult = await syncMoviesByYear(supabase, {
      fromYear: from,
      toYear: to,
      minVoteCount,
      // Per-page chatter would be thousands of lines over a full run; the
      // per-year line is the useful unit, plus anything unusual.
      onProgress: (message) => {
        if (!message.startsWith("page ")) console.log(`  ${message}`);
      },
      onYearDone: (year, result) => {
        const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
        console.log(
          `  ${year}: ${String(result.moviesUpserted).padStart(5)} upserted, ` +
            `${String(result.needsEmbedding).padStart(5)} need embedding ` +
            `(${result.pagesFetched} pages, ${minutes}m elapsed)`,
        );
      },
    });

    report(yearResult, startedAt);
    return;
  }

  const options = {
    pages: numericFlag("pages", 5),
    startPage: numericFlag("start-page", 1),
    minVoteCount: numericFlag("min-votes", 100),
  };

  console.log(
    `Syncing TMDB pages ${options.startPage}-${options.startPage + options.pages - 1} ` +
      `(min ${options.minVoteCount} votes)...`,
  );

  const result = await syncMovies(supabase, {
    ...options,
    onProgress: (message) => console.log(`  ${message}`),
  });

  report(result, startedAt);
}

function report(result: SyncResult, startedAt: number) {
  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(
    [
      `\nDone in ${minutes}m`,
      `  pages fetched:    ${result.pagesFetched}`,
      `  movies seen:      ${result.moviesSeen}`,
      `  movies upserted:  ${result.moviesUpserted}`,
      `  needs embedding:  ${result.needsEmbedding}`,
      `  skipped:          ${result.skipped}`,
      `\nNext: npm run embed:movies`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`\nSync failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
