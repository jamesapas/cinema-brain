import { streamChat, type ChatEvent, type ChatMessage } from "@/lib/agent/chat";
import { createServerSupabase } from "@/lib/supabase/server";
import { createUserClient } from "@/lib/supabase/user-client";

/**
 * POST /api/chat — streams one assistant turn as Server-Sent Events.
 *
 * Auth comes from the Supabase session cookie (the browser path). A bearer token
 * is also accepted so the CLI harness can drive the same endpoint. Either way the
 * token ends up in an RLS-scoped client, which is what confines the
 * rating-history tool to the caller's own rows.
 */

type ChatRequestBody = { messages?: unknown };

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent | { type: "error"; message: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of streamChat({ supabase, messages })) {
          send(event);
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
