"use server";

import {
  listConversations,
  loadConversation,
  type ConversationSummary,
  type StoredTurn,
} from "@/lib/agent/history";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Reads and deletes for the history list.
 *
 * Writes are not here: turns are saved by /api/chat as the reply lands, so the
 * transcript survives closing the tab mid-answer. These are only what the panel
 * needs to look back at what was saved.
 *
 * Like the rating actions, each one verifies the caller itself. RLS is the real
 * boundary — every query below is scoped by policy — but the check turns
 * "returned nothing" into a stated reason.
 */

export type HistoryListResult =
  | { ok: true; conversations: ConversationSummary[]; hasMore: boolean }
  | { ok: false; error: string };

/** How many rows a page of history is. Roughly two screens of the sidebar. */
const PAGE_SIZE = 20;

/**
 * One page of the history list. `before` is the `updatedAt` of the last row
 * already on screen; omit it for the first page.
 */
export async function fetchConversations(before?: string): Promise<HistoryListResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to see your chats." };

  try {
    const conversations = await listConversations(supabase, { limit: PAGE_SIZE, before });
    // A full page means there is plausibly another; the page after it comes
    // back empty and settles the question then. Cheaper than a count.
    return { ok: true, conversations, hasMore: conversations.length === PAGE_SIZE };
  } catch (error) {
    console.error("[fetchConversations]", error);
    return { ok: false, error: "Couldn't load your chats." };
  }
}

export type HistoryTurnsResult =
  | { ok: true; turns: StoredTurn[] }
  | { ok: false; error: string };

export async function fetchConversation(id: string): Promise<HistoryTurnsResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to see your chats." };

  try {
    return { ok: true, turns: await loadConversation(supabase, id) };
  } catch (error) {
    console.error("[fetchConversation]", error);
    return { ok: false, error: "Couldn't open that chat." };
  }
}

export type DeleteConversationResult = { ok: true } | { ok: false; error: string };

export async function deleteConversation(id: string): Promise<DeleteConversationResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to manage your chats." };

  // The messages go with it: the foreign key cascades.
  const { error } = await supabase.from("chat_conversations").delete().eq("id", id);

  if (error) {
    console.error("[deleteConversation]", error);
    return { ok: false, error: "Couldn't delete that chat." };
  }

  return { ok: true };
}
