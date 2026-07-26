/**
 * Search constants shared by the server queries and the browser UI.
 *
 * Its own module for the same reason images.ts exists: `catalog.ts` chains to
 * Pinecone, so a client component importing a constant from it drags the whole
 * server data layer into the browser bundle and the build fails on `require
 * ('fs')`. Nothing here may import anything server-only.
 */

/** The shortest query worth running: one letter matches most of the catalog. */
export const MIN_SEARCH_LENGTH = 2;
