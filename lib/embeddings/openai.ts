import OpenAI from "openai";

import { serverEnv } from "@/lib/env";

/**
 * The embedding model and its dimension are a matched pair: the Pinecone index
 * is created with EMBEDDING_DIMENSION, so changing the model here without
 * rebuilding the index produces a dimension-mismatch error on upsert. Both the
 * index setup script and the embed job read these constants.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: serverEnv.openaiApiKey, maxRetries: 4 });
  return client;
}

export type EmbedResult = {
  embeddings: number[][];
  totalTokens: number;
};

/**
 * Embeds a batch of texts, returning vectors in the same order as the input.
 *
 * The API may return `data` out of order, so results are placed by their
 * `index` field rather than trusting array position — getting this wrong would
 * silently attach every movie's vector to the wrong movie.
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) return { embeddings: [], totalTokens: 0 };

  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  if (response.data.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, received ${response.data.length}`,
    );
  }

  const embeddings = new Array<number[]>(texts.length);
  for (const item of response.data) {
    if (item.embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSION}-dim vectors from ${EMBEDDING_MODEL}, got ${item.embedding.length}`,
      );
    }
    embeddings[item.index] = item.embedding;
  }

  return { embeddings, totalTokens: response.usage?.total_tokens ?? 0 };
}
