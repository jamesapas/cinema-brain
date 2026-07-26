"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import type { ChatEvent, ToolCallTrace } from "@/lib/agent/chat";

/**
 * Human-readable names for the tools. The rail is user-facing, so it names what
 * the agent consulted, not the function it called.
 */
const TOOL_LABELS: Record<string, string> = {
  search_movies_by_metadata: "by metadata",
  search_movies_by_meaning: "by meaning",
  get_my_rating_history: "your ratings",
  combine_and_rank_results: "merge & rank",
};

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** One short line describing what the agent actually asked for. */
function summarize(name: string, input: unknown): string | null {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "search_movies_by_meaning") {
    return typeof args.query === "string" ? truncate(args.query, 70) : null;
  }

  if (name === "search_movies_by_metadata") {
    const parts: string[] = [];
    if (Array.isArray(args.genres) && args.genres.length > 0) {
      parts.push(args.genres.join(", "));
    }
    if (typeof args.title_contains === "string") parts.push(`“${args.title_contains}”`);
    if (args.year_from || args.year_to) {
      parts.push(`${args.year_from ?? "…"}–${args.year_to ?? "…"}`);
    }
    if (typeof args.min_rating === "number") parts.push(`rated ${args.min_rating}+`);
    if (typeof args.sort_by === "string") parts.push(`by ${args.sort_by}`);
    return parts.length > 0 ? truncate(parts.join(" · "), 70) : null;
  }

  if (name === "combine_and_rank_results") {
    const count = Array.isArray(args.candidates) ? args.candidates.length : 0;
    return `${count} candidate${count === 1 ? "" : "s"}`;
  }

  if (name === "get_my_rating_history") {
    return typeof args.min_rating === "number" ? `rated ${args.min_rating}+` : "all ratings";
  }

  return null;
}

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCallTrace[];
      streaming: boolean;
      error?: string;
    };

const EXAMPLE_PROMPTS = [
  "What should I watch tonight?",
  "Something bittersweet about memory",
  "A comedy under 100 minutes",
];

/**
 * The conversation itself, with no page chrome — it fills whatever container it
 * is given, so the drawer owns the framing.
 */
export function ChatConversation({ seedPrompt }: { seedPrompt?: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Opening the drawer from a film's "Ask about this" seeds the box rather than
  // sending straight away, so the question can still be edited.
  useEffect(() => {
    if (!seedPrompt) return;
    setDraft(seedPrompt);
    inputRef.current?.focus();
  }, [seedPrompt]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || streaming) return;

    const history = turns
      .filter((turn) => !("error" in turn && turn.error))
      .map((turn) => ({ role: turn.role, content: turn.content }));

    setDraft("");
    setStreaming(true);
    setTurns((current) => [
      ...current,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", toolCalls: [], streaming: true },
    ]);

    const updateAssistant = (patch: (turn: Extract<Turn, { role: "assistant" }>) => void) => {
      setTurns((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return current;
        const clone = { ...last, toolCalls: [...last.toolCalls] };
        patch(clone);
        next[next.length - 1] = clone;
        return next;
      });
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: trimmed }],
        }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : `Request failed (${response.status}).`;
        throw new Error(message);
      }
      if (!response.body) throw new Error("The server sent an empty response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are blank-line separated; keep any partial tail for the
        // next chunk rather than parsing half a frame.
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
              updateAssistant((turn) => {
                turn.content += event.text;
              });
              break;
            case "tool_call":
              updateAssistant((turn) => {
                turn.toolCalls.push({
                  iteration: event.iteration,
                  name: event.name,
                  input: event.input,
                });
              });
              break;
            case "error":
              updateAssistant((turn) => {
                turn.error = event.message;
              });
              break;
            case "done":
              break;
          }
        }
      }
    } catch (error) {
      updateAssistant((turn) => {
        turn.error = error instanceof Error ? error.message : "Something went wrong.";
      });
    } finally {
      updateAssistant((turn) => {
        turn.streaming = false;
      });
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {turns.length === 0 ? (
          <div>
            <p className="font-prose leading-relaxed text-bone-soft">
              Ask for something specific — a mood, a constraint, or just what to watch.
              Answers come from the catalog and your ratings.
            </p>
            <p className="label mt-6">Try</p>
            <ul className="mt-2 flex flex-col items-start gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => void send(prompt)}
                    className="text-left font-prose text-bone-soft underline decoration-ink-line underline-offset-4 transition-colors hover:text-bone hover:decoration-lamp"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <article key={index}>
                  <p className="label">You</p>
                  <p className="mt-1.5 font-prose leading-relaxed text-bone">
                    {turn.content}
                  </p>
                </article>
              ) : (
                <article key={index}>
                  <p className="label">Cinema Brain</p>

                  {turn.content ? (
                    <div className="prose-notes mt-2 font-prose text-sm text-bone-soft">
                      <Markdown>{turn.content}</Markdown>
                      {turn.streaming && <span className="caret" aria-hidden />}
                    </div>
                  ) : turn.streaming && !turn.error ? (
                    <p className="mt-2 font-mono text-xs text-bone-dim">
                      {turn.toolCalls.length === 0
                        ? "Reading your question…"
                        : "Consulting the catalog…"}
                      <span className="caret" aria-hidden />
                    </p>
                  ) : null}

                  {turn.error && (
                    <p
                      role="alert"
                      className="mt-2 border-l-2 border-lamp pl-3 font-mono text-xs leading-relaxed text-lamp"
                    >
                      {turn.error} — try asking again.
                    </p>
                  )}

                  {turn.toolCalls.length > 0 && (
                    <div className="mt-4 border-t border-ink-line pt-3">
                      <p className="label">Consulted</p>
                      <ol className="mt-2 flex flex-col gap-2">
                        {turn.toolCalls.map((call, callIndex) => {
                          const detail = summarize(call.name, call.input);
                          return (
                            <li
                              key={`${call.iteration}-${call.name}-${callIndex}`}
                              className="rail-entry flex gap-2.5"
                            >
                              {/* Iteration number: which round of the tool loop. */}
                              <span
                                className="font-mono text-[0.625rem] leading-5 text-lamp"
                                aria-label={`Round ${call.iteration}`}
                              >
                                {String(call.iteration).padStart(2, "0")}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-mono text-[0.6875rem] leading-5 text-bone">
                                  {TOOL_LABELS[call.name] ?? call.name}
                                </span>
                                {detail && (
                                  <span className="mt-0.5 block font-prose text-xs leading-snug text-bone-dim">
                                    {detail}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </article>
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="flex shrink-0 items-end gap-3 border-t border-ink-line px-5 py-4"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          placeholder="Ask for a film…"
          aria-label="Ask for a film"
          disabled={streaming}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent py-1.5 font-prose text-bone placeholder:text-bone-dim/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || draft.trim().length === 0}
          className="btn btn-quiet shrink-0 px-4 py-2"
        >
          {streaming ? "Working…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
