/**
 * Refreshes only the movies TMDB changed recently, rather than rescanning the
 * catalog. Meant to run daily from GitHub Actions:
 *
 *   npm run sync:changes -- --days=1 --min-votes=10
 *
 * The vote floor applies only to titles not already in the catalog: the changes
 * feed is unfiltered, and most of what it reports as "new" is zero-vote noise.
 * Existing rows are refreshed regardless.
 *
 * Same env loading as scripts/sync-movies.ts: .env* via @next/env, so it behaves
 * the same locally and in CI (where the vars come from repo secrets instead).
 */

import { loadEnvConfig } from "@next/env";

import { syncChangedMovies } from "@/lib/movies/sync";
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

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const result = await syncChangedMovies(supabase, {
    days: numericFlag("days", 1),
    minVoteCount: numericFlag("min-votes", 10),
  });

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(
    `TMDB changes sync: ${result.changedIds} changed, ${result.inserted} new, ` +
      `${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed, ` +
      `${result.needsEmbedding} need embedding (${minutes}m)`,
  );
}

main().catch((error: unknown) => {
  console.error(`Changes sync failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
