/**
 * Refreshes the "Trending" shelf from TMDB's `/trending/movie/day` endpoint.
 *
 *   npm run sync:trending
 *   npm run sync:trending -- --pages=3
 *
 * Fetches the daily trending list, upserts each movie's details into the
 * catalog, and stamps each row with its trending rank (1 = #1 trending).
 * Previous ranks are cleared so only today's list appears.
 *
 * Meant to run daily from GitHub Actions, but safe to run locally any time.
 */

import { loadEnvConfig } from "@next/env";

import { syncTrending } from "@/lib/movies/sync";
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

  const result = await syncTrending(supabase, {
    pages: numericFlag("pages", 2),
    onProgress: (message) => console.log(`  ${message}`),
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\nTrending sync done in ${seconds}s: ` +
      `${result.trendingRanked} ranked, ${result.moviesUpserted} upserted, ` +
      `${result.needsEmbedding} need embedding, ${result.failed} failed`,
  );
}

main().catch((error: unknown) => {
  console.error(`Trending sync failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
