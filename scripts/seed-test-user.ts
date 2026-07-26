/**
 * Creates (or reuses) a test user and seeds a few ratings, so the agent's
 * rating-history tool can be exercised against real RLS behavior before the
 * auth UI exists.
 *
 *   npm run seed:test-user
 *
 * Idempotent. Prints the credentials for scripts/chat.ts to sign in with.
 */

import { loadEnvConfig } from "@next/env";

import { createAdminClient } from "@/lib/supabase/admin";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

/** Deliberately lopsided taste, so personalization is visible in the output. */
const SEED_RATINGS: { title: string; rating: number; notes: string }[] = [
  { title: "Inception", rating: 10, notes: "Layered, cerebral, rewatched it three times." },
  { title: "Everything Everywhere All at Once", rating: 9, notes: "Chaotic and moving." },
  { title: "The Substance", rating: 8, notes: "Body horror that actually says something." },
  { title: "Arrival", rating: 9, notes: "Quiet sci-fi about grief and language." },
  { title: "Minions & Monsters", rating: 3, notes: "Not for me — too broad." },
  { title: "Scary Movie", rating: 4, notes: "Spoof comedy leaves me cold." },
];

async function main() {
  loadEnvConfig(process.cwd());
  const supabase = createAdminClient();

  // Reuse the user if a previous run created it.
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw new Error(`Failed to list users: ${listError.message}`);

  let userId = existing.users.find((u) => u.email === TEST_EMAIL)?.id;

  if (userId) {
    console.log(`Reusing existing test user ${TEST_EMAIL} (${userId})`);
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createError) throw new Error(`Failed to create user: ${createError.message}`);
    userId = created.user.id;
    console.log(`Created test user ${TEST_EMAIL} (${userId})`);
  }

  console.log("\nSeeding ratings...");
  let seeded = 0;
  let missing = 0;

  for (const entry of SEED_RATINGS) {
    const { data: movie, error: lookupError } = await supabase
      .from("movies")
      .select("id, title")
      .ilike("title", entry.title)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed for ${entry.title}: ${lookupError.message}`);
    if (!movie) {
      console.log(`  skipped "${entry.title}" — not in the catalog`);
      missing++;
      continue;
    }

    const { error: upsertError } = await supabase.from("user_movie_ratings").upsert(
      {
        user_id: userId,
        movie_id: movie.id,
        rating: entry.rating,
        notes: entry.notes,
      },
      { onConflict: "user_id,movie_id" },
    );

    if (upsertError) {
      throw new Error(`Failed to rate ${movie.title}: ${upsertError.message}`);
    }
    console.log(`  ${entry.rating}/10  ${movie.title}`);
    seeded++;
  }

  console.log(
    [
      `\nSeeded ${seeded} rating(s)${missing > 0 ? `, ${missing} not in catalog` : ""}.`,
      `\nSign in as:`,
      `  email:    ${TEST_EMAIL}`,
      `  password: ${TEST_PASSWORD}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
