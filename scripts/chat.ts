/**
 * Drives the chat agent from the terminal as the seeded test user, printing the
 * tool calls the model chose so you can see its reasoning path.
 *
 *   npm run chat -- "recommend me something for tonight"
 *   npm run chat -- --route "..."     # goes through POST /api/chat (needs `npm run dev`)
 *
 * Signs in with a real Supabase password grant, so the tools run under RLS
 * exactly as they will in the app.
 */

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { runChat, type ChatEvent, type ChatResult } from "@/lib/agent/chat";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/user-client";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

const ROUTE_URL = process.env.CHAT_ROUTE_URL ?? "http://localhost:3000/api/chat";

async function signIn(): Promise<string> {
  const supabase = createClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(
      `Sign-in failed for ${TEST_EMAIL}: ${error?.message ?? "no session returned"}. ` +
        `Run \`npm run seed:test-user\` first.`,
    );
  }

  return data.session.access_token;
}

/** Consumes the route's SSE stream and reassembles it into a finished turn. */
async function viaRoute(accessToken: string, prompt: string): Promise<ChatResult> {
  const response = await fetch(ROUTE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : response.statusText;
    throw new Error(`${ROUTE_URL} returned ${response.status}: ${message}`);
  }
  if (!response.body) throw new Error("Route returned no body.");

  const result: ChatResult = {
    text: "",
    toolCalls: [],
    iterations: 0,
    finishReason: null,
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; anything after the last one is a
    // partial frame to carry into the next chunk.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("");
      if (!payload) continue;

      const event = JSON.parse(payload) as
        | ChatEvent
        | { type: "error"; message: string };

      switch (event.type) {
        case "text_delta":
          result.text += event.text;
          break;
        case "tool_call":
          result.toolCalls.push({
            iteration: event.iteration,
            name: event.name,
            input: event.input,
          });
          break;
        case "done":
          result.iterations = event.iterations;
          result.finishReason = event.finishReason;
          result.usage = event.usage;
          break;
        case "error":
          throw new Error(`Route reported: ${event.message}`);
      }
    }
  }

  result.text = result.text.trim();
  return result;
}

async function main() {
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  const useRoute = args.includes("--route");
  const prompt = args.filter((arg) => arg !== "--route").join(" ").trim();

  if (!prompt) {
    throw new Error('Provide a prompt, e.g. npm run chat -- "what should I watch?"');
  }

  const accessToken = await signIn();

  console.log(`> ${prompt}`);
  console.log(useRoute ? `  (via ${ROUTE_URL})\n` : "  (in-process)\n");

  const startedAt = Date.now();
  const result = useRoute
    ? await viaRoute(accessToken, prompt)
    : await runChat({
        supabase: createUserClient(accessToken),
        messages: [{ role: "user", content: prompt }],
      });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.toolCalls.length === 0) {
    console.log("Tool calls: none — the model answered directly.\n");
  } else {
    console.log("Tool calls:");
    for (const call of result.toolCalls) {
      console.log(`  [${call.iteration}] ${call.name}`);
      console.log(`      ${JSON.stringify(call.input)}`);
    }
    console.log();
  }

  console.log(`${result.text}\n`);
  console.log(
    `— ${seconds}s · ${result.iterations} iteration(s) · ` +
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out · ` +
      `stop: ${result.finishReason}`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nChat failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
