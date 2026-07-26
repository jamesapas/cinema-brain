/**
 * Creates the Pinecone index for movie vectors. Idempotent — safe to re-run.
 *
 *   npm run pinecone:setup
 *
 * If the index already exists, its dimension is checked against the embedding
 * model rather than silently proceeding: a mismatch there only surfaces later as
 * a confusing upsert failure.
 */

import { loadEnvConfig } from "@next/env";

import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "@/lib/embeddings/openai";
import { serverEnv } from "@/lib/env";
import { PINECONE_INDEX_CONFIG, getPineconeClient } from "@/lib/pinecone";

async function main() {
  loadEnvConfig(process.cwd());

  const name = serverEnv.pineconeIndexName;
  const pinecone = getPineconeClient();

  const { indexes } = await pinecone.listIndexes();
  const existing = indexes?.find((index) => index.name === name);

  if (existing) {
    console.log(`Index "${name}" already exists.`);
    if (existing.dimension !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Dimension mismatch: index "${name}" is ${existing.dimension}-dim but ` +
          `${EMBEDDING_MODEL} produces ${EMBEDDING_DIMENSION}-dim vectors. ` +
          `Delete the index or point PINECONE_INDEX_NAME at a new one.`,
      );
    }
    console.log(
      `  dimension: ${existing.dimension}  metric: ${existing.metric}  status: ${existing.status?.state}`,
    );
    return;
  }

  console.log(
    `Creating serverless index "${name}" ` +
      `(${PINECONE_INDEX_CONFIG.dimension}-dim, ${PINECONE_INDEX_CONFIG.metric}, ` +
      `${PINECONE_INDEX_CONFIG.cloud}/${PINECONE_INDEX_CONFIG.region})...`,
  );

  await pinecone.createIndex({
    name,
    dimension: PINECONE_INDEX_CONFIG.dimension,
    metric: PINECONE_INDEX_CONFIG.metric,
    spec: {
      serverless: {
        cloud: PINECONE_INDEX_CONFIG.cloud,
        region: PINECONE_INDEX_CONFIG.region,
      },
    },
    // Two concurrent runs shouldn't blow up, and the index must be queryable
    // before the embed job starts upserting.
    suppressConflicts: true,
    waitUntilReady: true,
  });

  console.log(`Index "${name}" is ready.`);
}

main().catch((error: unknown) => {
  console.error(`\nSetup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
