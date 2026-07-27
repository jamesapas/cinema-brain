import OpenAI from "openai";

import { CHAT_MODEL } from "@/lib/agent/chat";
import { serverEnv } from "@/lib/env";
import type { RatedMovie } from "@/lib/movies/catalog";
import { tasteStats } from "@/lib/profiles/stats";

/**
 * Kino's read on someone's taste.
 *
 * The expensive part of this file is one small model call, and the design is
 * built around not making it. The summary lives on the profile row next to a
 * fingerprint of the ratings it was written from; a page render compares the
 * fingerprint it can compute for free against the stored one and only pays for
 * a new summary when they differ. A profile nobody has rated into since the
 * last summary is served from Postgres forever, at zero cost.
 *
 * What the model sees is deliberately small: a few counts and a couple dozen
 * titles, not the whole rated grid. The read comes from the shape of the
 * ratings, and the shape survives truncation.
 */

/**
 * Overridable so this can run on something cheaper than the chat model — this
 * is a paragraph off a list, not a reasoning problem. Defaults to the model we
 * already know exists on this account.
 */
const SUMMARY_MODEL = process.env.TASTE_SUMMARY_MODEL ?? CHAT_MODEL;

/** Enough for four or five sentences, with no room to run on. */
const MAX_SUMMARY_TOKENS = 220;

/**
 * Below this, there is nothing honest to say — four films is a coincidence,
 * not a taste. The UI shows a plain "not enough yet" line instead.
 */
export const MIN_RATED_FOR_SUMMARY = 5;

/**
 * How long a fresh summary is left alone even when the ratings have moved.
 *
 * Rating films happens in bursts: someone logs ten in a sitting, and each one
 * changes the fingerprint. Without this, that sitting costs ten calls to say
 * nearly the same thing. The first summary is never delayed — this only
 * applies once one exists.
 */
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

/** Titles the model sees from each end of the list. */
const LOVED_SAMPLE = 14;
const DISLIKED_SAMPLE = 5;

/**
 * How many of the loved films also send their plot summary, and how much of it.
 *
 * This is the one knob that trades cost for insight: genres alone can't tell
 * Heat from Ocean's Eleven, and the overview is already sitting on the row.
 * Eight short synopses is roughly 250 tokens — cheaper than an embedding call
 * and about the user rather than about films adjacent to theirs.
 */
const PLOT_SAMPLE = 8;
const PLOT_CHARS = 180;

const SUMMARY_PROMPT = `You are Kino, a film programmer who has been watching what this person watches. Write a short read on the kind of filmgoer they are.

Your reply completes the sentence "Kino describes them as…", so it MUST begin with "A" or "An" and read as a description of a person. For example: "A movie lover who…", "A viewer drawn to…", "An audience of one for…".

Write 2-3 sentences. No greeting, no preamble, no heading, no quotation marks. Plain prose — no lists, no markdown.

Never use "you" or "your", and never use their name. The same sentence is shown to them and to people visiting their profile, so it has to read correctly either way. Keep it in the third person throughout; "they/their" is fine when a pronoun is unavoidable.

You are answering: what kind of film fan is this, what do their choices say about them, and what pattern runs through their taste that they probably haven't noticed themselves. Name the thread that connects films they'd never think to connect — the thing they keep going back to across different genres and decades. The best line you can write is one that makes them think "I didn't realize I did that."

The numbers you were given are for working it out, not for repeating. Never cite a count, an average, a star value, or how their scale runs — no "five of eight films", no "nothing below 4 stars", no "a generous scale". They have a stats page for that. Talk about films and what they suggest, not about the data.

Ground every claim in their actual films, and name two or three of them as you go. Use the plot summaries to find what those films share underneath their genres. Never invent a film, a genre, or a preference their ratings do not show. If the ratings genuinely have no through-line, say what they do have — range, restlessness, a willingness to try anything — rather than forcing a pattern that isn't there.

Warm, but not flattering, and never generic. No "clearly loves cinema", no "impeccable taste", no labels like "a true cinephile". Reply with the description and nothing else.`;

/**
 * A stable fingerprint of what the summary was written from.
 *
 * Only ratings feed it — the same films at the same scores mean the same read,
 * whatever else changed on the account. Order-independent by construction, so
 * re-sorting the query never invalidates a good summary.
 */
export function tasteFingerprint(rated: RatedMovie[]): string {
  const pairs = rated
    .map((entry) => `${entry.movie.id}:${entry.rating}`)
    .sort()
    .join(",");

  // FNV-1a, 32-bit. This is a change detector, not a security boundary: the
  // cost of a collision is one stale paragraph.
  let hash = 0x811c9dc5;
  for (let i = 0; i < pairs.length; i++) {
    hash ^= pairs.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${rated.length}-${(hash >>> 0).toString(16)}`;
}

/** Whether a stored summary still describes the ratings the user has now. */
export function summaryIsStale(
  rated: RatedMovie[],
  storedKey: string | null,
  storedAt: string | null,
): boolean {
  if (rated.length < MIN_RATED_FOR_SUMMARY) return false;
  if (storedKey === tasteFingerprint(rated)) return false;

  // Nothing cached yet — write one now, cooldown or not.
  if (!storedKey || !storedAt) return true;

  return Date.now() - new Date(storedAt).getTime() >= REFRESH_COOLDOWN_MS;
}

/**
 * One line per film. `withPlot` is what lets the read reach past genre labels —
 * "Crime/Drama" is true of both Heat and Ocean's Eleven and says nothing about
 * why someone loves one of them, whereas a sentence of plot does.
 *
 * The text is already on the row the profile page fetched, so this costs
 * nothing to obtain — only the tokens it occupies, which is why it goes to the
 * top of the list and not the whole of it.
 */
function line(entry: RatedMovie, withPlot = false): string {
  const year = entry.movie.release_year ?? "";
  const genres = entry.movie.genres.slice(0, 3).join("/");
  const head = `${entry.rating / 2}★ ${entry.movie.title}${year ? ` (${year})` : ""}${genres ? ` — ${genres}` : ""}`;

  if (!withPlot) return head;

  const plot = (entry.movie.overview ?? "").trim();
  if (!plot) return head;

  // First sentence or so. A synopsis's opening line carries the premise; the
  // rest is cast and consequence, which the read doesn't rest on.
  const trimmed =
    plot.length <= PLOT_CHARS ? plot : `${plot.slice(0, plot.lastIndexOf(" ", PLOT_CHARS))}…`;
  return `${head}\n    ${trimmed}`;
}

/**
 * The whole prompt payload, kept to a few hundred tokens.
 *
 * `rated` arrives best-first, so the ends of the list are the loved and the
 * disliked, and the middle is the part that says the least per token.
 */
function buildInput(rated: RatedMovie[]): string {
  const stats = tasteStats(rated, 6);
  const loved = rated.slice(0, LOVED_SAMPLE);
  // Starts where `loved` ended, so a short list doesn't send the same films twice.
  const disliked = rated.slice(Math.max(loved.length, rated.length - DISLIKED_SAMPLE));

  const genres = stats.topGenres.map((entry) => entry.genre).join(", ");

  return [
    // Calibration, not material: a 4★ from someone who averages 4.6 means
    // something different than the same score from someone who averages 3.1.
    // The prompt forbids repeating any of it back.
    `Background for your own reasoning only — do not restate any of this: ${stats.count} films rated, averaging ${stats.averageStars?.toFixed(2) ?? "—"}★ out of 5. Genres they return to most: ${genres || "none recorded"}.`,
    "",
    "What they rated highest:",
    // Plots only for the top of the list — that is where the pattern lives, and
    // the tail is there for breadth rather than for reading closely.
    ...loved.map((entry, index) => line(entry, index < PLOT_SAMPLE)),
    ...(disliked.length > 0 ? ["", "What they rated lowest:", ...disliked.map((e) => line(e))] : []),
  ].join("\n");
}

/**
 * Kino's paragraph, or null if the model gave nothing usable.
 *
 * Null is not an error to the caller: the profile page has a perfectly good
 * page without this section, and a failed summary should not fail the render
 * or burn the cached one that is already there.
 */
export async function generateTasteSummary(rated: RatedMovie[]): Promise<string | null> {
  if (rated.length < MIN_RATED_FOR_SUMMARY) return null;

  const client = new OpenAI({ apiKey: serverEnv.openaiApiKey });

  const response = await client.responses.create({
    model: SUMMARY_MODEL,
    instructions: SUMMARY_PROMPT,
    input: buildInput(rated),
    // Reading a list of scores is not a reasoning problem, and the effort
    // setting is most of what this call would otherwise cost.
    reasoning: { effort: "none" },
    max_output_tokens: MAX_SUMMARY_TOKENS,
    store: false,
  });

  // The header ends in "…as", so a wrapping quote — which a model asked for a
  // sentence fragment sometimes adds back — would read as a broken sentence.
  const text = (response.output_text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["“'']+|["”'']+$/g, "")
    .trim();

  return text.length > 0 ? text : null;
}
