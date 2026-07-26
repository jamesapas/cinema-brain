"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { ChatConversation } from "@/app/chat-panel";
import { KinoMark } from "@/app/components/kino-mark";

/**
 * Kino, summoned over whatever you were looking at.
 *
 * A centred panel rather than the old right-hand drawer, and built from the
 * same two cards as the search overlay: you ask at the top, the answer opens
 * beneath. Both are things you call up and dismiss, so they share one shape.
 *
 * The context exists so anything on the page — a hero, a poster — can open it
 * with a question already in the box.
 */

type ChatOverlayContextValue = {
  open: (seedPrompt?: string) => void;
};

const ChatOverlayContext = createContext<ChatOverlayContextValue | null>(null);

export function useChatOverlay() {
  const context = useContext(ChatOverlayContext);
  if (!context) {
    throw new Error("useChatOverlay must be used inside ChatOverlayProvider.");
  }
  return context;
}

export function ChatOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);

  const open = useCallback((prompt?: string) => {
    setSeedPrompt(prompt ?? null);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Body scroll belongs to the panel while it is open, the same as search.
  useEffect(() => {
    if (!isOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  return (
    <ChatOverlayContext.Provider value={{ open }}>
      {children}

      <SummonButton onClick={() => open()} hidden={isOpen} />

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setIsOpen(false)}
            className="scrim-in absolute inset-0 bg-ink/70 backdrop-blur-md"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ask Kino"
            className="palette-in relative flex max-h-full w-full max-w-[620px] flex-col gap-2"
          >
            <ChatConversation seedPrompt={seedPrompt} onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </ChatOverlayContext.Provider>
  );
}

/**
 * The floating summon.
 *
 * A disc holding Kino's mark that opens into a labelled pill on hover or
 * focus, so it states what it is without occupying a pill's worth of the page
 * at rest. It also retracts to the bare disc while the page is scrolling: a
 * fixed trigger otherwise sits on top of a poster or a chart at some scroll
 * positions, and shrinking out of the way is the honest fix rather than more
 * padding under the content.
 */
function SummonButton({ onClick, hidden }: { onClick: () => void; hidden: boolean }) {
  const [scrolling, setScrolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onScroll() {
      setScrolling(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      // Settle delay: long enough that a flick doesn't flicker the label back
      // mid-gesture, short enough that it returns as soon as you stop.
      timerRef.current = setTimeout(() => setScrolling(false), 400);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Kino"
      // `group` drives the label; `hidden` state is opacity + pointer-events
      // rather than unmounting, so the mark fades instead of popping.
      className={`group fixed right-5 bottom-5 z-30 flex items-center gap-2.5 rounded-full border border-lamp/35 bg-ink-raised/95 py-3 pl-3.5 text-lamp shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-lamp/70 hover:bg-ink-raised focus-visible:border-lamp/70 focus-visible:outline-none ${
        scrolling ? "pr-3.5" : "pr-3.5 hover:pr-5 focus-visible:pr-5"
      } ${hidden ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100"}`}
    >
      <KinoMark size={22} className="shrink-0" />

      {/*
        Width, not display: a label that unmounts makes the disc jump. Animating
        max-width from 0 lets it unroll, and whitespace-nowrap keeps the words
        on one line while there is not yet room for them.
      */}
      <span
        className={`overflow-hidden text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
          scrolling
            ? "max-w-0 opacity-0"
            : "max-w-0 opacity-0 group-hover:max-w-32 group-hover:opacity-100 group-focus-visible:max-w-32 group-focus-visible:opacity-100"
        }`}
      >
        Ask Kino
      </span>
    </button>
  );
}

/**
 * Opens Kino with an arbitrary question ready to send. Used where a title
 * lookup has failed but describing the film might still work.
 */
export function AskAgentButton({ prompt, label }: { prompt: string; label: string }) {
  const { open } = useChatOverlay();

  return (
    <button type="button" onClick={() => open(prompt)} className="btn btn-primary">
      {label}
    </button>
  );
}

/**
 * Opens Kino with a question about a specific film already typed in.
 *
 * `onOpened` lets whatever hosts the button stand down — the details dialog
 * sits above the panel, so it has to close or the answer arrives out of sight.
 */
export function AskAboutButton({
  title,
  onOpened,
}: {
  title: string;
  onOpened?: () => void;
}) {
  const { open } = useChatOverlay();

  return (
    <button
      type="button"
      onClick={() => {
        open(`Should I watch ${title} tonight?`);
        onOpened?.();
      }}
      className="btn btn-primary"
    >
      Ask Kino about this
    </button>
  );
}
