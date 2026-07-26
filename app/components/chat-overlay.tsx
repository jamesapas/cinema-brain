"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { ChatConversation } from "@/app/chat-panel";
import { KinoAvatar } from "@/app/components/kino-avatar";

/**
 * Kino, summoned over whatever you were looking at.
 *
 * A centred panel rather than the old right-hand drawer. It deliberately does
 * NOT copy the search overlay's two-card shape: search is a lookup you scan
 * and leave, chat is someone you talk to. So this is one window with a face
 * at the top, a transcript in the middle, and the composer at the bottom —
 * the layout everyone already knows how to read.
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
            // sheet-in, not search's palette-in: it rises rather than drops, so
            // the two panels don't arrive the same way.
            className="sheet-in relative flex max-h-full w-full max-w-[920px] flex-col"
          >
            <ChatConversation seedPrompt={seedPrompt} onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </ChatOverlayContext.Provider>
  );
}

/**
 * The floating summon: Kino's face, sitting still.
 *
 * It has lost, in order, a label that unrolled on hover, a mint ring, and a
 * permanent pulse — each of which was a thing happening in the corner of your
 * eye while you were trying to read the page. A recognisable face at a fixed
 * size is enough to be found, and everything else was the button talking over
 * the content it floats above.
 *
 * The fixed size is also what let the scroll listener go: the old wide trigger
 * had to retract while scrolling because it lay across posters. A disc doesn't.
 */
function SummonButton({ onClick, hidden }: { onClick: () => void; hidden: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Kino"
      // The edge is neutral now, not mint: a coloured ring around a coloured
      // face was two things asking for attention where one would do. What's
      // left is a faint halo, and it blooms only under the cursor.
      className={`kino-summon kino-focus fixed right-6 bottom-6 z-30 grid h-16 w-16 place-items-center rounded-full border border-ink-line bg-ink-raised/95 backdrop-blur-sm ${
        hidden ? "pointer-events-none scale-90 opacity-0" : "opacity-100"
      }`}
    >
      <KinoAvatar size={46} />
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
    <button type="button" onClick={() => open(prompt)} className="btn btn-kino">
      <KinoFaceChip />
      {label}
    </button>
  );
}

/**
 * His face, bare on the button.
 *
 * No disc behind it: his outline and screen are dark enough to hold their own
 * against cream, and the plate was reading as a second shape inside a shape.
 * Slightly larger than it was to compensate for losing that frame.
 */
function KinoFaceChip() {
  return <KinoAvatar size={24} className="-my-0.5" />;
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
      className="btn btn-kino"
    >
      <KinoFaceChip />
      Ask Kino
    </button>
  );
}
