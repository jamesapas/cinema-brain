/**
 * Checks the local catalog against TMDB, year by year.
 *
 *   npm run verify:catalog -- --min-votes=10 --from-year=1880 --to-year=2026
 *
 * A sync that prints "Done" has only told you the script exited. This asks
 * TMDB how many films it holds for each release year under the same filter and
 * compares that to what we stored, so a year that silently came up short is
 * visible rather than assumed away.
 *
 * Exact equality is not the bar. Expect small negative drift: TMDB's counts
 * move as people vote, and the sync pins `primary_release_date.lte` to its
 * start date, so films released mid-run are counted by TMDB and not by us.
 * A year missing a handful is normal; a year missing hundreds is a failed run.
 */

import { loadEnvConfig } from "@next/env";

import { discoverMovies } from "@/lib/tmdb";
import { createAdminClient } from "@/lib/supabase/admin";

/** Report a year as short only when it misses this share of TMDB's count. */
const SHORTFALL_TOLERANCE = 0.02;

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  return raw === undefined ? fallback : Number(raw);
}

async function main() {
  loadEnvConfig(process.cwd());

  const minVoteCount = numericFlag("min-votes", 10);
  const fromYear = numericFlag("from-year", 1880);
  const toYear = numericFlag("to-year", new Date().getUTCFullYear());

  const supabase = createAdminClient();

  // One grouped read beats 147 round trips. The catalog is small enough that
  // pulling just the year column is cheaper than a view or an RPC.
  const localByYear = new Map<number, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("movies")
      .select("release_year")
      .not("release_year", "is", null)
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`Failed to read local years: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.release_year === null) continue;
      localByYear.set(row.release_year, (localByYear.get(row.release_year) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }

  const localTotal = [...localByYear.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `Local catalog: ${localTotal} films with a release year, ` +
      `${localByYear.size} distinct years.\n` +
      `Comparing ${fromYear}-${toYear} against TMDB (min ${minVoteCount} votes)...\n`,
  );

  let tmdbTotal = 0;
  // Counted per year rather than reusing localTotal: that one covers the whole
  // catalog, which is only the same thing when the range covers every year.
  let localInRange = 0;
  const short: { year: number; local: number; remote: number }[] = [];

  for (let year = toYear; year >= fromYear; year--) {
    const remote = (await discoverMovies({ page: 1, minVoteCount, primaryReleaseYear: year }))
      .total_results;
    const local = localByYear.get(year) ?? 0;
    tmdbTotal += remote;
    localInRange += local;

    if (remote > 0 && local < remote * (1 - SHORTFALL_TOLERANCE)) {
      short.push({ year, local, remote });
    }
  }

  console.log(`TMDB total across ${fromYear}-${toYear}:  ${tmdbTotal}`);
  console.log(`Local total across ${fromYear}-${toYear}: ${localInRange}`);
  console.log(`Coverage: ${((localInRange / tmdbTotal) * 100).toFixed(1)}%\n`);

  if (short.length === 0) {
    console.log("Every year is within tolerance. The catalog is complete.");
    return;
  }

  console.log(`${short.length} year(s) short by more than ${SHORTFALL_TOLERANCE * 100}%:`);
  for (const { year, local, remote } of short) {
    console.log(`  ${year}: have ${local}, TMDB has ${remote} (missing ${remote - local})`);
  }
  console.log(
    `\nRe-run those years, e.g.:\n` +
      `  npm run sync:movies -- --from-year=${short[short.length - 1].year} ` +
      `--to-year=${short[0].year} --min-votes=${minVoteCount}`,
  );
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\nVerification failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
