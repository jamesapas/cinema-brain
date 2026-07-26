import { Pinecone, type Index, type RecordMetadata } from "@pinecone-database/pinecone";

import { EMBEDDING_DIMENSION } from "@/lib/embeddings/openai";
import { serverEnv } from "@/lib/env";

/** Serverless index config. Cosine is the right metric for OpenAI embeddings. */
export const PINECONE_INDEX_CONFIG = {
  dimension: EMBEDDING_DIMENSION,
  metric: "cosine",
  cloud: "aws",
  region: "us-east-1",
} as const;

/** All movie vectors live in one namespace, keeping room for others later. */
export const MOVIES_NAMESPACE = "movies";

/**
 * Metadata mirrored onto each vector so the semantic-search tool can apply
 * genre/year filters inside the vector query itself, instead of over-fetching
 * and filtering afterwards. Kept deliberately small — the full row lives in
 * Postgres and is hydrated by id after the search returns.
 */
export type MovieMetadata = RecordMetadata & {
  title: string;
  genres: string[];
  release_year?: number;
  vote_average?: number;
};

let client: Pinecone | undefined;

export function getPineconeClient(): Pinecone {
  client ??= new Pinecone({ apiKey: serverEnv.pineconeApiKey });
  return client;
}

export function getMoviesIndex(): Index<MovieMetadata> {
  return getPineconeClient()
    .index<MovieMetadata>(serverEnv.pineconeIndexName)
    .namespace(MOVIES_NAMESPACE);
}
