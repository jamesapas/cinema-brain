"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import { Icon } from "@iconify/react";

import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
} from "@/app/actions/chat-history";
import { KinoAvatar } from "@/app/components/kino-avatar";
import { PosterCard } from "@/app/components/poster-card";
import type { ChatEvent, ToolCallTrace } from "@/lib/agent/chat";
import type { ConversationSummary } from "@/lib/agent/history";
import type { ShownMovie } from "@/lib/agent/tools";

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCallTrace[];
      movies: ShownMovie[];
      streaming: boolean;
      error?: string;
    };

/**
 * The posters for what Kino just recommended, under the words that recommended
 * them.
 *
 * A plain scrolling strip rather than a CarouselRow: that component brings a
 * heading, hover arrows, and a ResizeObserver, all of which are furniture for a
 * page-wide shelf and clutter inside a chat bubble. The cards themselves are
 * the same PosterCard the rest of the site uses, so the stars here write to the
 * same place — a recommendation you can rate without leaving the conversation.
 */
function ChatPosterStrip({
  movies,
  revealed,
}: {
  movies: ShownMovie[];
  /** False while Kino is still writing: mounted and loading, but not yet shown. */
  revealed: boolean;
}) {
  if (movies.length === 0) return null;

  return (
    /*
     * Mounted the moment Kino settles on the films, but clipped to nothing
     * until his reply lands.
     *
     * Showing it only at the end looked right and behaved badly: the download
     * could not start until the strip existed, so it arrived as a row of empty
     * frames that filled in seconds later. Every poster is a TMDB fetch and a
     * server-side re-encode, which is far slower than the animation it was
     * meant to be waiting for. Mounting early spends the seconds he is still
     * typing on the network instead.
     *
     * h-0 + overflow-hidden keeps it out of the layout while it loads, so
     * nothing moves until the reveal.
     */
    <div className={revealed ? "" : "h-0 overflow-hidden"} aria-hidden={!revealed}>
      {/* -mx-1 px-1: the cards' focus rings and hover scale would otherwise be
          clipped by the scroll container's own edge. */}
      <div
        // A scrollable region needs to be focusable to be reachable by keyboard,
        // and needs a name once it is — but not while it is still hidden.
        role="group"
        aria-label="Recommended films"
        tabIndex={revealed ? 0 : -1}
        className="strip-scroll -mx-1 mt-4 flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2"
      >
        {movies.map((movie, index) => (
          // The delay is inline rather than an nth-child rule because the count
          // is whatever Kino chose — up to eight, and usually not that.
          // shrink-0 has to be repeated here: this wrapper is now the flex item,
          // and the card's own shrink-0 no longer applies to the strip's layout.
          <div
            key={movie.id}
            className={`shrink-0 ${revealed ? "poster-in" : ""}`}
            style={revealed ? { animationDelay: `${index * 70}ms` } : undefined}
          >
            <PosterCard
              movie={movie}
              rating={movie.userRating}
              size="compact"
              // Eager, because while the strip is clipped it is nowhere near the
              // viewport and a lazy image would wait for the reveal — which is
              // the delay this whole arrangement exists to avoid.
              preload
            />
          </div>
        ))}
      </div>
    </div>
  );
}

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

/**
 * What Kino says to himself while he works.
 *
 * Deliberately not a status readout. "Searching the catalog" and "Ranking
 * results" describe the machine, and describing the machine is the one thing
 * his prompt forbids him to do out loud — a spinner that narrates the plumbing
 * breaks the character the rest of the panel is trying to keep.
 *
 * So these are the shape of a thought instead: hesitating, discarding, changing
 * his mind. None of them promises a particular kind of answer, because the pool
 * is drawn from before anyone knows what the tools will return.
 */
const THINKING_LINES = [
  "Let me think.",
  "Hmm.",
  "One second.",
  "There's something…",
  "Turning this over.",
  "Not the obvious one.",
  "Weighing two against each other.",
  "Ruling a few out.",
  "Narrowing it down.",
  "Almost.",
  "Trying to place it.",
  "There's a better answer than the first one.",
  "Nearly have it.",
  "Reconsidering.",
  "That's closer.",
  "Wait — yes.",
];

/** Long enough to read and sit with, short enough that it never feels stuck. */
const THINKING_INTERVAL_MS = 2600;

/**
 * A line of Kino's thinking, replaced every few seconds.
 *
 * The line is the whole indicator. It used to sit next to a three-dot typing
 * animation, which was two loading states saying the same thing in the same
 * row — the rotating text already reads as in-progress on its own.
 *
 * The rotating text is hidden from assistive tech and the row carries one
 * stable label: a screen reader announcing a new sentence every 2.6 seconds
 * would be reading out a loading state, over and over, while the actual reply
 * is still being written.
 */
function KinoThinking() {
  // Shuffled per mount, so two turns in a row don't open on the same thought.
  const [lines] = useState(() => pickRandom(THINKING_LINES, THINKING_LINES.length));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % lines.length),
      THINKING_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    // relative: the sr-only line below is absolutely positioned, and without a
    // positioned ancestor its containing block is the page rather than this row.
    <p className="relative flex items-center gap-2 py-2">
      {/* Announced once. The visible line is hidden from assistive tech because
          a live region that rewrites itself every 2.6 seconds reads the loading
          state aloud on a loop, over the reply the user is waiting for. */}
      <span role="status" className="sr-only">
        Kino is thinking
      </span>

      {/* Keyed on the index so React remounts the span and the entry animation
          replays — a CSS transition on a changing text node would not. */}
      <span
        key={index}
        aria-hidden
        className="thinking-in font-prose text-[0.9375rem] text-bone-dim italic"
      >
        {lines[index]}
      </span>
    </p>
  );
}

/**
 * Everything Kino has been asked before, most recent first.
 *
 * Only the first page is fetched. The rest arrives as you reach the end of the
 * list — someone with two hundred chats should not pay for two hundred rows to
 * click the second one.
 */
function ConversationList({
  conversations,
  loading,
  loadingMore,
  hasMore,
  error,
  activeId,
  onOpen,
  onDelete,
  onLoadMore,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** The conversation currently open, marked so it can be found. */
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  /*
   * The next page is asked for when the foot of the list is actually looked at.
   *
   * An IntersectionObserver rather than a scroll handler: the sentinel sits
   * inside a scrolling column, and the observer already accounts for being
   * clipped by that column — no measuring, and nothing running on every frame
   * of a scroll.
   *
   * onLoadMore is deliberately not a dependency. It is redefined on every
   * render of the panel, and re-subscribing on each one would fire again the
   * moment a page arrives while the sentinel is still on screen. The ref keeps
   * the callback current without touching the subscription.
   */
  const loadMoreRef = useRef(onLoadMore);

  // In an effect rather than during render: a ref written while rendering is
  // a side effect on a pass React is free to discard.
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  if (loading) {
    return (
      <p role="status" className="px-3 py-6 font-prose text-sm text-bone-dim">
        Looking these up…
      </p>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="mx-1 rounded-xl border border-lamp/40 px-3 py-3 font-prose text-sm text-lamp"
      >
        {error}
      </p>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-6 font-prose text-sm leading-relaxed text-bone-dim">
        Nothing here yet. Whatever you ask him next will be.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {conversations.map((conversation) => (
          // The row is a button with a second button beside it, not inside it:
          // a delete control nested in a clickable row is a button within a
          // button, which is invalid and behaves differently in every browser.
          <li
            key={conversation.id}
            className={`group flex items-center rounded-lg transition-colors ${
              conversation.id === activeId ? "bg-bone/8" : "hover:bg-bone/6"
            }`}
          >
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              aria-current={conversation.id === activeId ? "true" : undefined}
              className="min-w-0 flex-1 px-3 py-2 text-left"
            >
              {/* Title alone. The list is already in the order you last spoke
                  to them, so a date under each row was restating the sort. */}
              <span
                className={`block truncate font-prose text-sm ${
                  conversation.id === activeId ? "text-bone" : "text-bone-soft"
                }`}
              >
                {conversation.title}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(conversation.id)}
              aria-label={`Delete "${conversation.title}"`}
              // Visible on hover for the mouse, and always once focused, so it
              // is reachable by keyboard rather than merely present.
              className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-bone-dim opacity-0 transition group-hover:opacity-100 hover:bg-bone/10 hover:text-lamp focus-visible:opacity-100"
            >
              <Icon icon="lucide:trash-2" width={14} height={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        // Height rather than an empty node: a zero-height sentinel can sit
        // exactly on the scroll edge and never register as visible.
        <div ref={sentinelRef} className="h-10 px-3 py-3">
          {loadingMore && (
            <span role="status" className="text-xs text-bone-dim">
              Loading…
            </span>
          )}
        </div>
      )}
    </>
  );
}

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
   * The row this conversation is being saved to.
   *
   * Null before the first message: the row is created server-side by the turn
   * that starts it, and comes back as the first event of that turn's stream.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);

  /** Narrow screens have no room for the sidebar, so there it is a view. */
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    if (showHistory) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, showHistory]);

  /**
   * The first page, once, when the panel opens.
   *
   * Only the first: the rest is fetched when the foot of the list comes into
   * view. The sidebar is visible from the moment the panel is, so this can no
   * longer wait for someone to ask for it.
   */
  useEffect(() => {
    let cancelled = false;

    void fetchConversations().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setConversations(result.conversations);
        setHasMore(result.hasMore);
      } else {
        setHistoryError(result.error);
      }
      setHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMoreConversations() {
    // Guarded here rather than at the observer: the sentinel can cross the edge
    // twice in the time one page takes to arrive.
    if (loadingMore || historyLoading || !hasMore) return;

    const oldest = conversations[conversations.length - 1];
    if (!oldest) return;

    setLoadingMore(true);
    const result = await fetchConversations(oldest.updatedAt);

    if (result.ok) {
      // Filtered against what is already here: a conversation bumped to the top
      // while a page was in flight would otherwise arrive twice, and React
      // would have two rows with one key.
      setConversations((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [
          ...current,
          ...result.conversations.filter((entry) => !seen.has(entry.id)),
        ];
      });
      setHasMore(result.hasMore);
    } else {
      setHistoryError(result.error);
      // Stops the sentinel asking again for something that just failed.
      setHasMore(false);
    }

    setLoadingMore(false);
  }

  /**
   * Adds the chat that just started, or renames it once Kino has titled it.
   *
   * Cheaper than refetching the list, and steadier to look at: the row appears
   * in place rather than the whole sidebar blinking through a loading state
   * every time a conversation begins.
   */
  function noteConversation(id: string, title: string) {
    setConversations((current) => {
      const existing = current.find((entry) => entry.id === id);
      const updated: ConversationSummary = {
        id,
        title,
        updatedAt: new Date().toISOString(),
      };
      return existing
        ? [updated, ...current.filter((entry) => entry.id !== id)]
        : [updated, ...current];
    });
  }

  /** Clears the board. The saved conversation stays saved; this just leaves it. */
  function startNewChat() {
    setTurns([]);
    setConversationId(null);
    setDraft("");
    setShowHistory(false);
    inputRef.current?.focus();
  }

  async function openConversation(id: string) {
    setHistoryError(null);
    const result = await fetchConversation(id);

    if (!result.ok) {
      setHistoryError(result.error);
      return;
    }

    setTurns(
      result.turns.map((turn) =>
        turn.role === "user"
          ? { role: "user", content: turn.content }
          : {
              role: "assistant",
              content: turn.content,
              // Tool calls aren't stored: they were the working, and what was
              // worth keeping is the answer and the films it landed on.
              toolCalls: [],
              movies: turn.movies,
              streaming: false,
            },
      ),
    );
    setConversationId(id);
    setShowHistory(false);
  }

  async function removeConversation(id: string) {
    // Dropped from the list first: the row is gone from the user's point of
    // view the moment they ask, and a list that waits on a round trip to
    // respond feels broken rather than careful.
    setConversations((current) => current.filter((entry) => entry.id !== id));

    // Deleting the one you are reading clears it too. Leaving the transcript up
    // would show a conversation that no longer exists, and carrying on typing
    // into it would open a second one missing everything above.
    if (id === conversationId) {
      setTurns([]);
      setConversationId(null);
    }

    const result = await deleteConversation(id);
    if (!result.ok) setHistoryError(result.error);
  }

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
    setShowHistory(false);
    setTurns((current) => [
      ...current,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", toolCalls: [], movies: [], streaming: true },
    ]);

    const updateAssistant = (patch: (turn: Extract<Turn, { role: "assistant" }>) => void) => {
      setTurns((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role !== "assistant") return current;
        const clone = { ...last, toolCalls: [...last.toolCalls], movies: [...last.movies] };
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
          // Absent on the first message of a chat; the server opens the
          // conversation and names it back to us.
          conversationId,
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
            case "conversation":
              // Arrives at the start of every turn, and again if the server
              // renames a new chat once it has something to name it from.
              setConversationId(event.id);
              noteConversation(event.id, event.title);
              break;
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
            case "movies":
              updateAssistant((turn) => {
                // Replaces, not appends — see the event's note in chat.ts.
                turn.movies = event.movies;
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
    <div className="overlay-card overlay-card-chat flex h-[84vh] max-h-full">
      {/*
        The history, permanently on the left — where a chat app keeps it, so
        nobody has to find it.

        Hidden below md: at phone width the panel is barely wider than the
        sidebar, and a 15rem column beside a reading column leaves neither. The
        header keeps the toggle for those sizes, which swaps the transcript for
        the same list.
      */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-line md:flex">
        {/* His name at the top of the column, where an app's name goes, rather
            than over the transcript — the header below is now the chat's, and
            the chat is already unmistakably his. */}
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-3.5">
          <KinoAvatar size={30} />
          <span className="text-base font-semibold text-bone">Kino</span>
        </div>

        <div className="shrink-0 px-2 pb-1">
          <button
            type="button"
            onClick={startNewChat}
            disabled={streaming}
            className="kino-focus flex w-full items-center gap-2 rounded-lg px-3 py-2.5 font-prose text-sm text-bone-soft transition-colors hover:bg-bone/8 hover:text-bone disabled:opacity-30"
          >
            <Icon icon="lucide:square-pen" width={16} height={16} aria-hidden />
            New chat
          </button>
        </div>

        <h2 className="shrink-0 px-5 pt-4 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-bone-dim uppercase">
          Recents
        </h2>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <ConversationList
            conversations={conversations}
            loading={historyLoading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={historyError}
            activeId={conversationId}
            onOpen={(id) => void openConversation(id)}
            onDelete={(id) => void removeConversation(id)}
            onLoadMore={() => void loadMoreConversations()}
          />
        </div>
      </aside>

      {/*
        relative: the floating close button below is positioned against this
        column rather than the panel, so it clears the sidebar.
      */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/*
          Floating rather than in a bar of its own. A full-width header holding
          one small X was a rule across the panel earning its keep with nothing;
          the transcript now starts at the top of the column.

          Only where the sidebar exists — below md the header stays, because it
          is still carrying his name and the two controls the sidebar would
          otherwise own.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          // Over the transcript, which scrolls underneath it: the disc and its
          // blur keep the icon legible when a line of prose passes behind.
          className="absolute top-3 right-3 z-10 hidden h-9 w-9 place-items-center rounded-full bg-ink-raised/80 text-bone-dim backdrop-blur-sm transition-colors hover:bg-bone/10 hover:text-bone md:grid"
        >
          <Icon icon="lucide:x" width={20} height={20} aria-hidden />
        </button>

        <header className="flex shrink-0 items-center gap-3 border-b border-ink-line px-5 py-3.5 md:hidden">
          <span className="flex flex-1 items-center gap-3">
            <KinoAvatar size={34} />
            <span className="text-base font-semibold text-bone">
              {showHistory ? "Your chats" : "Kino"}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            aria-label={showHistory ? "Back to chat" : "Your chats"}
            aria-pressed={showHistory}
            className="grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone aria-pressed:text-kino"
          >
            <Icon icon="lucide:history" width={19} height={19} aria-hidden />
          </button>

          {turns.length > 0 && (
            <button
              type="button"
              onClick={startNewChat}
              aria-label="New chat"
              disabled={streaming}
              className="grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone disabled:opacity-30"
            >
              <Icon icon="lucide:square-pen" width={19} height={19} aria-hidden />
            </button>
          )}

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
          {showHistory ? (
            <ConversationList
              conversations={conversations}
              loading={historyLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={historyError}
              activeId={conversationId}
              onOpen={(id) => void openConversation(id)}
              onDelete={(id) => void removeConversation(id)}
              onLoadMore={() => void loadMoreConversations()}
            />
          ) : turns.length === 0 ? (
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
                        <KinoThinking />
                      ) : null}

                      {/* Revealed only once the turn is done: artwork appearing
                          mid-sentence drags the eye off the words still being
                          written, and the words are the recommendation. It loads
                          in the background before then — see the strip. */}
                      <ChatPosterStrip movies={turn.movies} revealed={!turn.streaming} />

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
          Composer at the bottom of the reading column. Three nested corners,
          each the one outside it minus its own inset: panel 1.5rem, composer
          1rem at 0.5rem in, send button 0.5rem at 0.5rem in. Change any inset
          and the radius below it has to move too.

          Gone while the mobile list is up: there is nothing to say to a list,
          and leaving it there invites typing into a chat that isn't on screen.
        */}
        <div className={`shrink-0 px-2 pt-1 pb-2 ${showHistory ? "hidden" : ""}`}>
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
    </div>
  );
}
