import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShownMovie } from "@/lib/agent/tools";
import type { Database } from "@/lib/database.types";

/**
 * Reading and writing saved conversations.
 *
 * Everything here goes through an RLS-scoped client, so none of it filters by
 * user id: the policies do that, and a query that also filtered by hand would
 * be stating the rule in two places where only one of them is enforced.
 */

/** A conversation as the history list needs it — no messages, just the spine. */
export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

/** One stored turn, in the shape the panel renders. */
export type StoredTurn = {
  role: "user" | "assistant";
  content: string;
  movies: ShownMovie[];
};

/** Longer than this and the history list is reading a paragraph, not a label. */
const MAX_TITLE_LENGTH = 60;

/**
 * A message or a generated title, trimmed to something that fits a list row.
 *
 * Cut at a word boundary where there is one in reach, so a title ends on a word
 * rather than mid-syllable. The ellipsis is the character, not three dots.
 */
export function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_TITLE_LENGTH) return clean;

  const cut = clean.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Opens a conversation, titled from the message that started it. */
export async function createConversation(
  supabase: SupabaseClient<Database>,
  firstMessage: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("chat_conversations")
    // user_id is left to its auth.uid() default — the insert policy requires it
    // to be the caller either way.
    .insert({ title: titleFromMessage(firstMessage) })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Appends one turn. Movies are stored whole; a user turn has none. */
export async function appendMessage(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  turn: StoredTurn,
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    role: turn.role,
    content: turn.content,
    movies: turn.movies,
  });

  if (error) throw error;
}

/** Renames a conversation, trimmed to fit the list the same way. */
export async function renameConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("chat_conversations")
    .update({ title: titleFromMessage(title) })
    .eq("id", conversationId);

  if (error) throw error;
}

/**
 * Bumps the conversation to the top of the history list.
 *
 * The trigger only fires on update, and appending a message updates the
 * messages table rather than this one — so the touch has to be explicit.
 */
export async function touchConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw error;
}

/**
 * A page of the caller's conversations, most recently active first.
 *
 * Keyset rather than offset: the list is ordered by a column that changes while
 * you are reading it — sending a message moves that conversation to the top —
 * and an offset would then hand back a row the previous page already showed.
 * `before` is the last `updatedAt` you were given.
 */
export async function listConversations(
  supabase: SupabaseClient<Database>,
  { limit = 20, before }: { limit?: number; before?: string } = {},
): Promise<ConversationSummary[]> {
  let query = supabase
    .from("chat_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("updated_at", before);

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    // A conversation whose first message never made it to a title still needs
    // something to click on.
    title: row.title?.trim() || "Untitled conversation",
    updatedAt: row.updated_at,
  }));
}

/** Every turn of one conversation, in the order they were said. */
export async function loadConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<StoredTurn[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, movies")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    // The column is a plain text with a CHECK constraint rather than an enum,
    // so the generated type is `string` and this narrowing is ours to do.
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    // jsonb comes back as Json. It went in as ShownMovie[] and the column is
    // constrained to an array, so this is a cast rather than a parse.
    movies: (row.movies as ShownMovie[] | null) ?? [],
  }));
}
