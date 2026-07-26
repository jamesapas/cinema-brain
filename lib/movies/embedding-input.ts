import { createHash } from "node:crypto";

import type { MovieRow } from "@/lib/database.types";

/**
 * The single definition of what text represents a movie in vector space.
 *
 * Both the sync (which decides whether a row needs re-embedding) and the
 * embedding job (which sends text to the model) import this, so the hash stored
 * in `movies.embedding_input_hash` always describes the text that was actually
 * embedded. Changing this function invalidates every existing hash and therefore
 * triggers a full re-embed on the next sync — which is the intended behavior.
 */
export type EmbeddingInputFields = Pick<
  MovieRow,
  "title" | "release_year" | "genres" | "tagline" | "overview"
>;

export function buildEmbeddingInput(movie: EmbeddingInputFields): string {
  const parts = [
    movie.release_year ? `${movie.title} (${movie.release_year})` : movie.title,
    movie.genres.length > 0 ? `Genres: ${movie.genres.join(", ")}` : null,
    movie.tagline,
    movie.overview,
  ];

  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
    .trim();
}

export function hashEmbeddingInput(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
