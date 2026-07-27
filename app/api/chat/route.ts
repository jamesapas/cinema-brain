import { streamChat, type ChatEvent, type ChatMessage } from "@/lib/agent/chat";
import {
  appendMessage,
  createConversation,
  renameConversation,
  titleFromMessage,
  touchConversation,
} from "@/lib/agent/history";
import { generateConversationTitle } from "@/lib/agent/title";
import type { ShownMovie } from "@/lib/agent/tools";
import { createServerSupabase } from "@/lib/supabase/server";
import { createUserClient } from "@/lib/supabase/user-client";

/**
 * POST /api/chat — streams one assistant turn as Server-Sent Events.
 *
 * Auth comes from the Supabase session cookie (the browser path). A bearer token
 * is also accepted so the CLI harness can drive the same endpoint. Either way the
 * token ends up in an RLS-scoped client, which is what confines the
 * rating-history tool to the caller's own rows.
 *
 * The turn is also saved as it happens, rather than by the browser once it
 * finishes: the reply is written here, and a tab closed mid-answer should still
 * have the conversation waiting next time.
 */

type ChatRequestBody = { messages?: unknown; conversationId?: unknown };

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const messages: ChatMessage[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }
    messages.push({ role, content });
  }

  // The API requires the first turn to be from the user.
  if (messages[0].role !== "user") return null;

  return messages;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body must be valid JSON.", 400);
  }

  const messages = parseMessages(body.messages);
  if (!messages) {
    return errorResponse(
      "Expected { messages: [{ role: 'user' | 'assistant', content: string }] }, starting with a user turn.",
      400,
    );
  }

  const bearerToken = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  // Verify the caller rather than trusting the token. Skipping this would let an
  // expired token through and return an empty rating history, which reads as
  // "no ratings yet" instead of "not signed in".
  const supabase = bearerToken
    ? createUserClient(bearerToken)
    : await createServerSupabase();

  const { data: auth, error: authError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (authError || !auth.user) {
    return errorResponse("Sign in to chat.", 401);
  }

  const requestedConversation =
    typeof body.conversationId === "string" && body.conversationId.length > 0
      ? body.conversationId
      : null;

  // The turn being answered. The rest of `messages` is history the browser
  // replayed for context and is already stored.
  const newMessage = messages[messages.length - 1];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent | { type: "error"; message: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Null whenever saving failed. Every write below checks it, so a history
      // that cannot be written costs the record and nothing else — the reply
      // still streams.
      let conversationId: string | null = null;

      // A conversation is named once, from the exchange that opened it. Later
      // turns wander, and a list that renamed itself under you every message
      // would be unrecognisable by the time you went looking for it.
      const isNewConversation = requestedConversation === null;

      try {
        conversationId =
          requestedConversation ?? (await createConversation(supabase, newMessage.content));
        send({
          type: "conversation",
          id: conversationId,
          title: titleFromMessage(newMessage.content),
        });

        // Only a user turn is stored here. An assistant turn replayed from the
        // browser is one this route already wrote.
        if (newMessage.role === "user") {
          await appendMessage(supabase, conversationId, {
            role: "user",
            content: newMessage.content,
            movies: [],
          });
        }
      } catch (error) {
        console.error("[api/chat] history", error);
        conversationId = null;
      }

      // What the model says, accumulated so the finished turn can be stored.
      let replyText = "";
      let replyMovies: ShownMovie[] = [];

      try {
        for await (const event of streamChat({ supabase, messages })) {
          if (event.type === "text_delta") replyText += event.text;
          // Replaces, matching how the UI treats it — see the event's note.
          if (event.type === "movies") replyMovies = event.movies;
          send(event);
        }

        // Its own try: the reply has already been delivered, so failing to
        // record it is not a failed turn and must not be reported as one.
        if (conversationId && replyText.trim()) {
          try {
            await appendMessage(supabase, conversationId, {
              role: "assistant",
              content: replyText,
              movies: replyMovies,
            });
            await touchConversation(supabase, conversationId);
          } catch (error) {
            console.error("[api/chat] history", error);
          }

          // After the save, and after the reply is on screen: the title is for
          // a list nobody is looking at yet, so it is never worth making the
          // answer wait. The row is already named from the opening message, so
          // failing here leaves a plainer title rather than none.
          if (isNewConversation) {
            try {
              const title = await generateConversationTitle(newMessage.content, replyText);
              if (title) {
                await renameConversation(supabase, conversationId, title);
                send({ type: "conversation", id: conversationId, title });
              }
            } catch (error) {
              console.error("[api/chat] title", error);
            }
          }
        }
      } catch (error) {
        console.error("[api/chat]", error);
        // The response has already begun, so a failure has to arrive as an event
        // rather than an HTTP status the client can no longer see.
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Chat failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      // Tells proxies not to buffer, which would defeat streaming.
      "x-accel-buffering": "no",
    },
  });
}
