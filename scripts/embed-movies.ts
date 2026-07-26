/**
 * Embeds every movie with embedded_at IS NULL and upserts the vectors to
 * Pinecone. Idempotent and resumable — re-running only processes what's pending.
 *
 *   npm run embed:movies -- --limit=100 --batch-size=100
 */

import { loadEnvConfig } from "@next/env";

import { EMBEDDING_MODEL } from "@/lib/embeddings/openai";
import { embedPendingMovies } from "@/lib/movies/embeddings";
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

  const { count: pendingCount, error } = await supabase
    .from("movies")
    .select("id", { count: "exact", head: true })
    .is("embedded_at", null);

  if (error) throw new Error(`Failed to count pending movies: ${error.message}`);

  if (!pendingCount) {
    console.log("Nothing to embed — every movie is already in Pinecone.");
    return;
  }

  const limit = numericFlag("limit", pendingCount);
  console.log(
    `${pendingCount} movie(s) pending. Embedding up to ${limit} with ${EMBEDDING_MODEL}...`,
  );

  const startedAt = Date.now();
  const result = await embedPendingMovies(supabase, {
    limit,
    batchSize: numericFlag("batch-size", 100),
    onProgress: (message) => console.log(`  ${message}`),
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    [
      `\nDone in ${seconds}s`,
      `  batches:          ${result.batches}`,
      `  movies embedded:  ${result.embedded}`,
      `  tokens used:      ${result.totalTokens.toLocaleString()}`,
      `  hashes repaired:  ${result.hashesRepaired}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`\nEmbedding failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
