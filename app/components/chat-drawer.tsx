"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { ChatConversation } from "@/app/chat-panel";

/**
 * Chat is now a secondary surface: a drawer over the catalog rather than the
 * whole page. The context exists so anything on the page — a hero, a card — can
 * open it with a question already in the box.
 */

type ChatDrawerContextValue = {
  open: (seedPrompt?: string) => void;
};

const ChatDrawerContext = createContext<ChatDrawerContextValue | null>(null);

export function useChatDrawer() {
  const context = useContext(ChatDrawerContext);
  if (!context) {
    throw new Error("useChatDrawer must be used inside ChatDrawerProvider.");
  }
  return context;
}

export function ChatDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);

  const open = useCallback((prompt?: string) => {
    // Re-seeding with the same text still needs to reach the input, so append a
    // zero-width marker-free copy by resetting first.
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

  return (
    <ChatDrawerContext.Provider value={{ open }}>
      {children}

      {/* Trigger stays out of the way until wanted. */}
      <button
        type="button"
        onClick={() => open()}
        aria-expanded={isOpen}
        className="btn btn-primary fixed right-5 bottom-5 z-30 rounded-full px-5 py-3 shadow-lg"
      >
        Help me decide
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Ask Cinema Brain"
            className="relative flex h-full w-full max-w-md flex-col border-l border-ink-line bg-ink shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ink-line px-5 py-4">
              <span className="text-base font-bold text-bone">Ask Cinema Brain</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="meta transition-colors hover:text-bone"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1">
              <ChatConversation seedPrompt={seedPrompt} />
            </div>
          </aside>
        </div>
      )}
    </ChatDrawerContext.Provider>
  );
}

/**
 * Opens the drawer with a question about a specific film already typed in.
 *
 * `onOpened` lets whatever hosts the button stand down — the details dialog
 * sits above the drawer, so it has to close or the answer arrives out of sight.
 */
export function AskAboutButton({
  title,
  onOpened,
}: {
  title: string;
  onOpened?: () => void;
}) {
  const { open } = useChatDrawer();

  return (
    <button
      type="button"
      onClick={() => {
        open(`Should I watch ${title} tonight?`);
        onOpened?.();
      }}
      className="btn btn-primary"
    >
      Ask about this film
    </button>
  );
}
