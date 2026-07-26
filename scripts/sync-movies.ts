/**
 * Populates the shared `movies` catalog from TMDB.
 *
 *   npm run sync:movies -- --pages=5 --start-page=1 --min-votes=100
 *
 * Runs outside the Next.js runtime, so .env* files are loaded explicitly with
 * @next/env (the same loader Next uses, so precedence matches the app).
 *
 * The imports below are safe to hoist above loadEnvConfig because lib/env.ts
 * reads process.env through lazy getters — nothing touches env at module load.
 */

import { loadEnvConfig } from "@next/env";

import { syncMovies } from "@/lib/movies/sync";
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

async function main() {
  loadEnvConfig(process.cwd());

  const options = {
    pages: numericFlag("pages", 5),
    startPage: numericFlag("start-page", 1),
    minVoteCount: numericFlag("min-votes", 100),
  };

  console.log(
    `Syncing TMDB pages ${options.startPage}-${options.startPage + options.pages - 1} ` +
      `(min ${options.minVoteCount} votes)...`,
  );

  const startedAt = Date.now();
  const result = await syncMovies(createAdminClient(), {
    ...options,
    onProgress: (message) => console.log(`  ${message}`),
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    [
      `\nDone in ${seconds}s`,
      `  pages fetched:    ${result.pagesFetched}`,
      `  movies seen:      ${result.moviesSeen}`,
      `  movies upserted:  ${result.moviesUpserted}`,
      `  needs embedding:  ${result.needsEmbedding}`,
      `  skipped:          ${result.skipped}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`\nSync failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
