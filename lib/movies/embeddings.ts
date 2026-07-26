import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { embedTexts } from "@/lib/embeddings/openai";
import {
  buildEmbeddingInput,
  hashEmbeddingInput,
} from "@/lib/movies/embedding-input";
import { getMoviesIndex, type MovieMetadata } from "@/lib/pinecone";

const DEFAULT_BATCH_SIZE = 100;

/** Only the fields that feed the embedding text plus the vector metadata. */
const PENDING_SELECT =
  "id, title, release_year, genres, tagline, overview, vote_average, embedding_input_hash";

export type EmbedPendingOptions = {
  limit?: number;
  batchSize?: number;
  onProgress?: (message: string) => void;
};

export type EmbedPendingResult = {
  batches: number;
  embedded: number;
  totalTokens: number;
  hashesRepaired: number;
};

export async function embedPendingMovies(
  supabase: SupabaseClient<Database>,
  {
    limit = Number.POSITIVE_INFINITY,
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress = () => {},
  }: EmbedPendingOptions = {},
): Promise<EmbedPendingResult> {
  const index = getMoviesIndex();
  const result: EmbedPendingResult = {
    batches: 0,
    embedded: 0,
    totalTokens: 0,
    hashesRepaired: 0,
  };

  while (result.embedded < limit) {
    const remaining = limit - result.embedded;
    const take = Math.min(batchSize, remaining);

    // No offset paging needed: marking rows embedded removes them from this
    // query, so each pass returns the next slice of pending work.
    const { data: pending, error } = await supabase
      .from("movies")
      .select(PENDING_SELECT)
      .is("embedded_at", null)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(take);

    if (error) throw new Error(`Failed to read pending movies: ${error.message}`);
    if (!pending || pending.length === 0) break;

    const inputs = pending.map((movie) => buildEmbeddingInput(movie));
    const { embeddings, totalTokens } = await embedTexts(inputs);

    const records = pending.map((movie, i) => {
      // Pinecone rejects undefined metadata values, so optional fields are
      // omitted rather than set to null.
      const metadata: MovieMetadata = {
        title: movie.title,
        genres: movie.genres,
        ...(movie.release_year !== null && { release_year: movie.release_year }),
        ...(movie.vote_average !== null && { vote_average: movie.vote_average }),
      };

      return { id: String(movie.id), values: embeddings[i], metadata };
    });

    // Upsert to Pinecone BEFORE marking the rows embedded. If this process dies
    // in between, the rows stay pending and get re-embedded next run — Pinecone
    // upserts are keyed by id, so a retry overwrites rather than duplicating.
    // The reverse order would silently leave movies missing from the index.
    await index.upsert({ records });

    const embeddedAt = new Date().toISOString();

    // The hash stored at sync time should already describe this exact text. A
    // mismatch means buildEmbeddingInput changed in between, so store the hash
    // of what we actually embedded rather than leaving a stale value behind.
    const matched: number[] = [];
    const drifted: { id: number; hash: string }[] = [];

    pending.forEach((movie, i) => {
      const hash = hashEmbeddingInput(inputs[i]);
      if (hash === movie.embedding_input_hash) {
        matched.push(movie.id);
      } else {
        drifted.push({ id: movie.id, hash });
      }
    });

    if (matched.length > 0) {
      const { error: markError } = await supabase
        .from("movies")
        .update({ embedded_at: embeddedAt })
        .in("id", matched);
      if (markError) {
        throw new Error(`Failed to mark movies embedded: ${markError.message}`);
      }
    }

    for (const { id, hash } of drifted) {
      const { error: repairError } = await supabase
        .from("movies")
        .update({ embedded_at: embeddedAt, embedding_input_hash: hash })
        .eq("id", id);
      if (repairError) {
        throw new Error(`Failed to mark movie ${id} embedded: ${repairError.message}`);
      }
    }

    if (drifted.length > 0) {
      onProgress(
        `repaired ${drifted.length} drifted embedding hash(es) — ` +
          `buildEmbeddingInput changed since the last sync`,
      );
    }

    result.batches++;
    result.embedded += pending.length;
    result.totalTokens += totalTokens;
    result.hashesRepaired += drifted.length;

    onProgress(`batch ${result.batches}: embedded ${result.embedded} movies`);

    // Fewer rows than requested means the queue is drained.
    if (pending.length < take) break;
  }

  return result;
}
