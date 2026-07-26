import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

import { buildTools } from "@/lib/agent/tools";
import type { Database } from "@/lib/database.types";
import { serverEnv } from "@/lib/env";

/**
 * Model is overridable because this account has newer models than the one
 * defaulted to here, and their tool-selection behavior differs.
 */
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-5.5";

/** Safety net for the tool loop; a normal turn uses 1-4 iterations. */
const MAX_ITERATIONS = 12;

const SYSTEM_PROMPT = `You are Cinema Brain, a film recommendation assistant with access to a movie catalog of about 500 titles and the signed-in user's own ratings.

You have four tools. Decide for yourself which to use, in what order, and how many times — including none, when you can answer directly. Nothing routes for you.

Guidance, not rules:
- Attribute-shaped requests (genre, year, rating, a specific title) suit metadata search; mood, theme, or "feels like X" requests suit semantic search. Many requests want both.
- Any personalized request should rest on the user's actual rating history, not an assumption about their taste. If they have no ratings, say so and ask what they like.
- When you have candidates from more than one search, merge them with the combine tool rather than ranking by hand.
- The catalog is a subset of all cinema. If something plausible isn't there, say it isn't in the catalog rather than describing a film you did not retrieve.

Never invent a movie, a year, or a plot detail. Every title you name must come from a tool result.

Keep responses focused and conversational — a few sentences of framing plus a short list. For each recommendation give one concrete reason tied to what the tools returned. Skip preamble, and don't narrate which tools you are about to call.`;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ToolCallTrace = {
  iteration: number;
  name: string;
  input: unknown;
};

export type ChatUsage = { inputTokens: number; outputTokens: number };

/** Wire protocol between the agent loop, the route, and the browser. */
export type ChatEvent =
  | { type: "tool_call"; iteration: number; name: string; input: unknown }
  | { type: "text_delta"; text: string }
  | {
      type: "done";
      iterations: number;
      finishReason: string | null;
      usage: ChatUsage;
    };

export type RunChatOptions = {
  supabase: SupabaseClient<Database>;
  messages: ChatMessage[];
  /** Reasoning depth. `medium` keeps this chat interactive. */
  effort?: "minimal" | "low" | "medium" | "high";
};

/**
 * Runs one assistant turn, letting the model drive the tool loop, and yields
 * events as they happen so the UI can show progress instead of a spinner.
 *
 * The loop is mechanical: send state, execute whatever tool calls come back,
 * append the results, repeat until the model stops calling tools. It never
 * inspects the user's message or a tool name to decide what to do next — tool
 * selection belongs entirely to the model.
 */
export async function* streamChat({
  supabase,
  messages,
  effort = "medium",
}: RunChatOptions): AsyncGenerator<ChatEvent> {
  const client = new OpenAI({ apiKey: serverEnv.openaiApiKey });

  const tools = buildTools({ supabase });
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  const toolDefinitions = tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.jsonSchema,
    // Non-strict: strict mode requires every property to be required, which
    // would force all these genuinely optional filters to be sent as nulls.
    // Arguments are validated against the same Zod schema on execution.
    strict: false,
  }));

  const input: OpenAI.Responses.ResponseInputItem[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const stream = await client.responses.create({
      model: CHAT_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      tools: toolDefinitions,
      reasoning: { effort },
      // We resend the full state each turn rather than relying on server-side
      // storage, so nothing is retained on OpenAI's side between calls. That
      // makes carrying reasoning across tool calls our job — hence the include.
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
    });

    const functionCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
    let completed: OpenAI.Responses.Response | null = null;

    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          yield { type: "text_delta", text: event.delta };
          break;

        case "response.output_item.done":
          // Emitted once the arguments have finished streaming, so the trace
          // carries complete input rather than a partial JSON fragment.
          if (event.item.type === "function_call") {
            functionCalls.push(event.item);
            let parsed: unknown;
            try {
              parsed = JSON.parse(event.item.arguments);
            } catch {
              parsed = {};
            }
            yield {
              type: "tool_call",
              iteration,
              name: event.item.name,
              input: parsed,
            };
          }
          break;

        case "response.completed":
          completed = event.response;
          break;

        case "response.failed":
          throw new Error(
            `Model request failed: ${event.response.error?.message ?? "unknown error"}`,
          );

        case "response.incomplete":
          throw new Error(
            `Model response incomplete: ${
              event.response.incomplete_details?.reason ?? "unknown reason"
            }`,
          );

        case "error":
          throw new Error(`Stream error: ${event.message}`);

        default:
          break;
      }
    }

    if (!completed) {
      throw new Error("Stream ended without a completed response.");
    }

    usage.inputTokens += completed.usage?.input_tokens ?? 0;
    usage.outputTokens += completed.usage?.output_tokens ?? 0;

    // Every produced item goes back verbatim: dropping reasoning items would
    // lose the model's chain of thought between tool calls.
    //
    // The cast bridges an SDK union gap: ResponseOutputItem includes a
    // computer-use variant whose status can be "failed", which ResponseInputItem
    // doesn't accept. We declare only function tools, so that variant cannot
    // appear in this response.
    input.push(...(completed.output as OpenAI.Responses.ResponseInputItem[]));

    if (functionCalls.length === 0) {
      yield {
        type: "done",
        iterations: iteration,
        finishReason: completed.status ?? null,
        usage,
      };
      return;
    }

    // Parallel calls in one turn are expected; run them concurrently and return
    // every result together before asking the model to continue.
    const results = await Promise.all(
      functionCalls.map(async (call) => {
        let args: unknown;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          args = {};
        }

        const tool = toolsByName.get(call.name);
        const output = tool
          ? await tool.run(args)
          : JSON.stringify({ error: "unknown_tool", name: call.name });

        return {
          type: "function_call_output" as const,
          call_id: call.call_id,
          output,
        };
      }),
    );

    input.push(...results);
  }

  throw new Error(`Tool loop did not settle within ${MAX_ITERATIONS} iterations.`);
}

export type ChatResult = {
  text: string;
  toolCalls: ToolCallTrace[];
  iterations: number;
  finishReason: string | null;
  usage: ChatUsage;
};

/**
 * Non-streaming convenience wrapper over the same loop, for the CLI harness and
 * anything that just wants the finished turn.
 */
export async function runChat(options: RunChatOptions): Promise<ChatResult> {
  const toolCalls: ToolCallTrace[] = [];
  let text = "";
  let iterations = 0;
  let finishReason: string | null = null;
  let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

  for await (const event of streamChat(options)) {
    switch (event.type) {
      case "text_delta":
        text += event.text;
        break;
      case "tool_call":
        toolCalls.push({
          iteration: event.iteration,
          name: event.name,
          input: event.input,
        });
        break;
      case "done":
        iterations = event.iterations;
        finishReason = event.finishReason;
        usage = event.usage;
        break;
    }
  }

  return { text: text.trim(), toolCalls, iterations, finishReason, usage };
}
