"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import { Icon } from "@iconify/react";

import { KinoAvatar } from "@/app/components/kino-avatar";
import type { ChatEvent, ToolCallTrace } from "@/lib/agent/chat";

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCallTrace[];
      streaming: boolean;
      error?: string;
    };

/**
 * The pool the opening chips are drawn from. Deliberately spread across the
 * kinds of request Kino handles — a mood, a hard constraint, a lean on your
 * ratings, an outright shrug — so whichever three come up, they suggest the
 * range rather than one narrow way in.
 */
const SUGGESTIONS = [
  "What should I watch tonight?",
  "Something bittersweet about memory",
  "A comedy under 100 minutes",
  "Surprise me",
  "Something based on what I've rated",
  "A film I've probably never heard of",
  "Something to watch with my parents",
  "The best thing here from the 80s",
  "Something short and strange",
  "A rewatch I've forgotten about",
  "Something beautiful with barely a plot",
  "I can't face subtitles tonight",
];

/** How many chips the empty state offers. */
const SUGGESTION_COUNT = 3;

/** Fisher-Yates over a copy, so the pool itself is never reordered. */
function pickRandom<T>(pool: readonly T[], count: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/**
 * The conversation: a header with Kino in it, the transcript, and the
 * composer at the bottom — one window, the way a chat is read.
 */
export function ChatConversation({
  seedPrompt,
  onClose,
}: {
  seedPrompt?: string | null;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Chosen once per opening, so the chips never move between deciding to click
   * one and clicking it.
   *
   * Picking during render is safe only because this panel never renders on the
   * server — it mounts on click, from an overlay that starts closed. Random
   * values in server-rendered markup are a hydration mismatch.
   */
  const [suggestions] = useState(() => pickRandom(SUGGESTIONS, SUGGESTION_COUNT));

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
    <div className="overlay-card overlay-card-chat flex h-[84vh] max-h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-line px-5 py-3.5">
        <KinoAvatar size={34} />
        <span className="flex-1 text-base font-semibold text-bone">Kino</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
        >
          <Icon icon="lucide:x" width={20} height={20} aria-hidden />
        </button>
      </header>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <KinoAvatar size={88} />
            <p className="mt-5 font-prose text-xl text-bone">What are we watching?</p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => void send(prompt)}
                    className="rounded-full border border-ink-line px-4 py-2 font-prose text-sm text-bone-soft transition-colors hover:border-kino/50 hover:text-bone"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <article key={index} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-bone/10 px-4 py-3 font-prose text-[0.9375rem] leading-relaxed text-bone">
                    {turn.content}
                  </p>
                </article>
              ) : (
                // items-start, or the row's default stretch pulls the avatar to
                // the full height of a long reply and distorts his face.
                <article key={index} className="flex items-start gap-3.5">
                  <KinoAvatar size={30} className="mt-0.5" />

                  <div className="min-w-0 flex-1">
                    {turn.content ? (
                      // No bubble on his side: a long recommendation is prose,
                      // and prose in a balloon is harder to read than prose.
                      <div className="prose-notes font-prose text-[0.9375rem] leading-relaxed text-bone-soft">
                        <Markdown>{turn.content}</Markdown>
                        {turn.streaming && <span className="caret" aria-hidden />}
                      </div>
                    ) : turn.streaming && !turn.error ? (
                      <p
                        className="inline-flex items-center gap-1.5 py-2"
                        aria-label={
                          turn.toolCalls.length === 0
                            ? "Reading your question"
                            : "Consulting the catalog"
                        }
                      >
                        <span className="typing-dot h-2 w-2 rounded-full bg-kino/70" />
                        <span className="typing-dot h-2 w-2 rounded-full bg-kino/70" />
                        <span className="typing-dot h-2 w-2 rounded-full bg-kino/70" />
                      </p>
                    ) : null}

                    {turn.error && (
                      <p
                        role="alert"
                        className="mt-2 rounded-xl border border-lamp/40 px-4 py-3 font-prose text-sm leading-relaxed text-lamp"
                      >
                        {turn.error} — try asking again.
                      </p>
                    )}

                  </div>
                </article>
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/*
        Composer at the bottom, full width. Three nested corners, each the one
        outside it minus its own inset: panel 1.5rem, composer 1rem at 0.5rem
        in, send button 0.5rem at 0.5rem in. Change any inset and the radius
        below it has to move too.
      */}
      <div className="shrink-0 px-2 pt-1 pb-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className="flex w-full items-end gap-2 rounded-2xl border border-ink-line bg-bone/6 py-2 pr-2 pl-5 transition-colors focus-within:border-kino/40"
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
            placeholder="Message Kino"
            aria-label="Message Kino"
            disabled={streaming}
            className="composer-input max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent py-2.5 font-prose text-[0.9375rem] leading-relaxed text-bone placeholder:text-bone-dim/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || draft.trim().length === 0}
            aria-label="Send"
            // 0.5rem: the composer's 1rem corner minus the 0.5rem of padding
            // around this button, so the two curves nest the same way the
            // composer nests inside the panel.
            className="kino-focus grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-kino text-ink transition-opacity hover:opacity-90 disabled:opacity-25"
          >
            <Icon icon="lucide:arrow-up" width={20} height={20} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
