import OpenAI from "openai";

import { CHAT_MODEL } from "@/lib/agent/config";
import { serverEnv } from "@/lib/env";

/**
 * Naming a conversation.
 *
 * Its own small request rather than something Kino produces during the turn:
 * asking him to emit a title alongside the answer means either a tool call the
 * user waits on or a marker in the prose that has to be stripped out, and both
 * put the naming of the chat inside the reply the user is reading.
 *
 * So this runs after the reply has been delivered, and a failure is silent —
 * the row already has a title taken from the opening message.
 */

/**
 * Overridable, and worth overriding: this is a two-line request that any
 * cheap model can do, but model names differ per account so the default is
 * the one we already know works here.
 */
const TITLE_MODEL = process.env.TITLE_MODEL ?? CHAT_MODEL;

/** A handful of words, with room to spare rather than a truncated one. */
const MAX_TITLE_TOKENS = 64;

const TITLE_PROMPT = `Write a short title for this conversation between a user and a film recommendation assistant.

Two to five words. No quotation marks, no trailing punctuation, no "Chat about" or "Discussion of" preamble.

Name what was actually asked for — the mood, the constraint, or the films that came back. "Bittersweet films about memory" or "Short thrillers for a weeknight", not "Movie recommendations". If specific films dominated the exchange, naming one is fine.

Reply with the title and nothing else.`;

/**
 * A title for the exchange, or null if the model gave nothing usable.
 *
 * Callers treat null as "keep what's there" rather than an error: an unnamed
 * conversation is a worse outcome than a plainly named one, and neither is
 * worth failing a request over.
 */
export async function generateConversationTitle(
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  const client = new OpenAI({ apiKey: serverEnv.openaiApiKey });

  const response = await client.responses.create({
    model: TITLE_MODEL,
    instructions: TITLE_PROMPT,
    input: [
      { role: "user", content: userMessage },
      // Truncated: the opening of a reply carries what it is about, and the
      // rest is per-film detail this does not need to pay for.
      { role: "assistant", content: assistantReply.slice(0, 1200) },
    ],
    // Naming a chat you can already read is not a reasoning problem, and
    // gpt-5.5 rejects "minimal" outright.
    reasoning: { effort: "none" },
    max_output_tokens: MAX_TITLE_TOKENS,
    store: false,
  });

  return cleanTitle(response.output_text ?? "");
}

/**
 * Strips what models add to a title even when told not to: wrapping quotes, a
 * full stop, a "Title:" label, or a second line of explanation.
 */
function cleanTitle(raw: string): string | null {
  const firstLine = raw.trim().split("\n")[0] ?? "";

  const cleaned = firstLine
    .replace(/^\s*title\s*:\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}
