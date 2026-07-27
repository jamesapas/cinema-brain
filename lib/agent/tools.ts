import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { defineTool } from "@/lib/agent/tool-kit";

import type { Database } from "@/lib/database.types";
import { getRatingsByMovie, hydrateCards } from "@/lib/movies/catalog";
import type { MovieCard } from "@/lib/movies/images";
import {
  CATALOG_GENRES,
  getRatingHistory,
  hydrateMovies,
  searchByMeaning,
  searchByMetadata,
} from "@/lib/movies/search";

/**
 * The agent's five tools.
 *
 * Descriptions are deliberately prescriptive about *when* to call each tool,
 * not just what it does — that is what drives correct tool selection. There is
 * no routing logic anywhere in this file or its callers: the model sees all
 * five and decides which to call, in what order, and how many times.
 */

const genreEnum = z.enum(CATALOG_GENRES);

/** A poster the browser can render, with the viewer's own score already on it. */
export type ShownMovie = MovieCard & { userRating: number | null };

export type ToolContext = {
  /** RLS-scoped client. Determines whose ratings the history tool can see. */
  supabase: SupabaseClient<Database>;
  /**
   * Where `show_movies` sends its artwork.
   *
   * Tools return a string to the model and nothing else, so this is the only
   * way structured data reaches the UI without round-tripping through the
   * model — which would mean paying tokens for poster filenames and handing it
   * image paths to invent variations on.
   */
  onShowMovies?: (movies: ShownMovie[]) => void;
};

const RATING_AFFINITY_THRESHOLD = 7;

/** More than this and it stops being a recommendation and becomes a search page. */
const MAX_SHOWN_MOVIES = 8;

export function buildTools({ supabase, onShowMovies }: ToolContext) {
  const searchMoviesByMetadata = defineTool({
    name: "search_movies_by_metadata",
    description:
      "Find movies by concrete, filterable attributes: genre, release year range, " +
      "audience rating, or a title substring. Call this when the request names " +
      "specific facts — 'horror movies from the 90s', 'the highest-rated animated " +
      "films', 'that movie called Inception'. Do NOT use it for mood, theme, or " +
      "plot-similarity requests; it matches fields, not meaning.",
    parameters: z.object({
      genres: z
        .array(genreEnum)
        .optional()
        .describe("Genre names. Must be from the catalog's fixed vocabulary."),
      genre_match: z
        .enum(["any", "all"])
        .optional()
        .describe(
          "'any' (default) matches films in at least one listed genre; 'all' requires every one.",
        ),
      year_from: z.number().int().optional().describe("Earliest release year, inclusive."),
      year_to: z.number().int().optional().describe("Latest release year, inclusive."),
      min_rating: z
        .number()
        .optional()
        .describe("Minimum audience rating on a 0-10 scale."),
      min_votes: z
        .number()
        .int()
        .optional()
        .describe("Minimum vote count — raise this to exclude obscure titles."),
      title_contains: z
        .string()
        .optional()
        .describe("Case-insensitive title substring, for looking up a known film."),
      sort_by: z
        .enum(["popularity", "rating", "newest", "oldest"])
        .optional()
        .describe("Result ordering. Defaults to popularity."),
      limit: z.number().int().min(1).max(30).optional().describe("Max results (default 10)."),
    }),
    run: async (input) => {
      const results = await searchByMetadata(supabase, {
        genres: input.genres,
        genreMatch: input.genre_match,
        yearFrom: input.year_from,
        yearTo: input.year_to,
        minRating: input.min_rating,
        minVotes: input.min_votes,
        titleContains: input.title_contains,
        sortBy: input.sort_by,
        limit: input.limit,
      });

      return JSON.stringify({ count: results.length, results });
    },
  });

  const searchMoviesByMeaning = defineTool({
    name: "search_movies_by_meaning",
    description:
      "Semantic search over movie descriptions using vector similarity. Call this " +
      "when the request is about mood, theme, premise, or resemblance rather than " +
      "hard attributes — 'something bittersweet about memory', 'movies that feel " +
      "like Blade Runner', 'a heist but funny'. Optional genre and year filters " +
      "are applied inside the vector query, so you can combine meaning with " +
      "constraints in a single call.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "A descriptive phrase of the desired mood/theme/premise. Richer phrasing " +
            "retrieves better than single keywords.",
        ),
      genres: z.array(genreEnum).optional().describe("Restrict to these genres."),
      year_from: z.number().int().optional().describe("Earliest release year, inclusive."),
      year_to: z.number().int().optional().describe("Latest release year, inclusive."),
      limit: z.number().int().min(1).max(30).optional().describe("Max results (default 10)."),
    }),
    run: async (input) => {
      const results = await searchByMeaning(supabase, {
        query: input.query,
        genres: input.genres,
        yearFrom: input.year_from,
        yearTo: input.year_to,
        limit: input.limit,
      });

      return JSON.stringify({ count: results.length, results });
    },
  });

  const getMyRatingHistory = defineTool({
    name: "get_my_rating_history",
    description:
      "The signed-in user's own rated movies, with their scores and notes. Call " +
      "this whenever a request depends on personal taste — 'recommend me " +
      "something', 'what should I watch next', 'more like the stuff I love' — and " +
      "before making a personalized suggestion, so it rests on what they actually " +
      "rated rather than a guess. Returns an empty list for a user with no ratings; " +
      "say so plainly instead of inventing preferences.",
    parameters: z.object({
      min_rating: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Only ratings at or above this score — use ~7 to see favorites."),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 50)."),
    }),
    run: async (input) => {
      const ratings = await getRatingHistory(supabase, {
        minRating: input.min_rating,
        limit: input.limit,
      });

      return JSON.stringify({ count: ratings.length, ratings });
    },
  });

  const combineAndRankResults = defineTool({
    name: "combine_and_rank_results",
    description:
      "Merge candidates gathered from the search tools into one ranked shortlist. " +
      "Pass the movie_ids you collected, tagged with the tool they came from. This " +
      "de-duplicates across sources, rewards films that surfaced from more than one " +
      "search, boosts genres the user already rates highly, and can drop anything " +
      "they have already rated. Call it after running two or more searches, or when " +
      "one search returned more candidates than you want to present.",
    parameters: z.object({
      candidates: z
        .array(
          z.object({
            movie_id: z.number().int().describe("Movie id from a search result."),
            source: z
              .enum(["metadata", "meaning"])
              .describe("Which search produced this candidate."),
            similarity: z
              .number()
              .optional()
              .describe("The similarity score, when it came from semantic search."),
          }),
        )
        .min(1)
        .describe("Candidates to merge. Duplicates across sources are expected."),
      exclude_rated: z
        .boolean()
        .optional()
        .describe(
          "Drop movies the user has already rated (default true) — usually right " +
            "for recommendations, but set false when comparing against their history.",
        ),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 8)."),
    }),
    run: async (input) => {
      const excludeRated = input.exclude_rated ?? true;

      // Collapse duplicates, keeping the best similarity and every source that
      // surfaced the movie. Appearing in both searches is a real signal.
      const merged = new Map<
        number,
        { sources: Set<string>; similarity: number }
      >();
      for (const candidate of input.candidates) {
        const existing = merged.get(candidate.movie_id);
        if (existing) {
          existing.sources.add(candidate.source);
          existing.similarity = Math.max(existing.similarity, candidate.similarity ?? 0);
        } else {
          merged.set(candidate.movie_id, {
            sources: new Set([candidate.source]),
            similarity: candidate.similarity ?? 0,
          });
        }
      }

      const [movies, history] = await Promise.all([
        hydrateMovies(supabase, [...merged.keys()]),
        getRatingHistory(supabase, { limit: 100 }),
      ]);

      const ratedIds = new Set(history.map((r) => r.movie_id));

      // Genre affinity: how often each genre appears among the user's favorites.
      const favoriteGenreCounts = new Map<string, number>();
      for (const rating of history) {
        if ((rating.rating ?? 0) < RATING_AFFINITY_THRESHOLD) continue;
        for (const genre of rating.genres) {
          favoriteGenreCounts.set(genre, (favoriteGenreCounts.get(genre) ?? 0) + 1);
        }
      }
      const maxGenreCount = Math.max(1, ...favoriteGenreCounts.values());

      const ranked = [...merged.entries()]
        .flatMap(([movieId, entry]) => {
          const movie = movies.get(movieId);
          if (!movie) return []; // id not in the catalog — skip rather than guess
          if (excludeRated && ratedIds.has(movieId)) return [];

          const reasons: string[] = [];

          // Semantic hits carry a real score; metadata-only hits get a neutral
          // baseline so the two sources are comparable at all.
          const relevance = entry.similarity > 0 ? entry.similarity : 0.35;
          if (entry.similarity > 0) {
            reasons.push(`semantic similarity ${entry.similarity.toFixed(3)}`);
          }

          let score = relevance;

          if (entry.sources.size > 1) {
            score += 0.15;
            reasons.push("matched by both metadata and meaning");
          }

          const affinityHits = movie.genres
            .map((genre) => favoriteGenreCounts.get(genre) ?? 0)
            .filter((count) => count > 0);
          if (affinityHits.length > 0) {
            const affinity = Math.max(...affinityHits) / maxGenreCount;
            score += 0.2 * affinity;
            const matched = movie.genres.filter((g) => favoriteGenreCounts.has(g));
            reasons.push(`matches highly-rated genres: ${matched.join(", ")}`);
          }

          const quality = (movie.rating ?? 0) / 10;
          score += 0.1 * quality;

          return [{ ...movie, score: Number(score.toFixed(4)), sources: [...entry.sources], reasons }];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit ?? 8);

      return JSON.stringify({
        count: ranked.length,
        excluded_already_rated: excludeRated,
        results: ranked,
      });
    },
  });

  const showMovies = defineTool({
    name: "show_movies",
    description:
      "Display the posters of the films your reply names, as clickable cards " +
      "beneath it. Call this on EVERY turn that names specific films — not just " +
      "recommendations, but lists, factual answers, comparisons, or a single title " +
      "mentioned in passing. Call it once, as soon as you have settled on the " +
      "films, and then write your reply — the posters are placed under it however " +
      "they arrive. Pass the ids in the order you want them shown. Every id must " +
      "come from an earlier tool result; this tool cannot look films up, and an id " +
      "you did not retrieve is dropped. Still name and describe the films in your " +
      "reply as normal: the posters accompany what you wrote, they do not replace it.",
    parameters: z.object({
      movie_ids: z
        .array(z.number().int())
        .min(1)
        .max(MAX_SHOWN_MOVIES)
        .describe(
          "Movie ids from a previous tool result, in the order they should appear.",
        ),
    }),
    run: async (input) => {
      // De-duplicated, because the same film arriving twice would render as two
      // identical posters. The first mention wins, so the model's ordering holds.
      const ids = [...new Set(input.movie_ids)];

      const [cards, ratings] = await Promise.all([
        hydrateCards(supabase, ids),
        getRatingsByMovie(supabase),
      ]);

      const shown: ShownMovie[] = [];
      const missing: number[] = [];

      for (const id of ids) {
        const card = cards.get(id);
        // A poster-less card is a grey box with a title under it, which reads as
        // a broken image rather than a recommendation.
        if (!card || !card.poster_path) {
          missing.push(id);
          continue;
        }
        shown.push({ ...card, userRating: ratings.get(id) ?? null });
      }

      if (shown.length > 0) onShowMovies?.(shown);

      // The ack is deliberately thin: the model needs to know the call landed and
      // which ids failed so it can correct itself, not to read back the artwork.
      return JSON.stringify({
        shown: shown.length,
        missing_or_unavailable: missing,
      });
    },
  });

  return [
    searchMoviesByMetadata,
    searchMoviesByMeaning,
    getMyRatingHistory,
    combineAndRankResults,
    showMovies,
  ];
}
