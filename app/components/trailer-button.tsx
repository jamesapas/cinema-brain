"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function TrailerButton({
  movieTitle,
  youtubeKey,
}: {
  movieTitle: string;
  youtubeKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  // Lock body scroll when open and close on Escape key (matches SearchOverlay)
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!youtubeKey) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop scrim */}
      <button
        type="button"
        aria-label="Close trailer"
        onClick={() => setOpen(false)}
        className="scrim-in fixed inset-0 bg-ink/90 backdrop-blur-md"
      />

      {/* Simplified frameless modal dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${movieTitle} Official Trailer`}
        className="palette-in relative z-10 w-full max-w-4xl overflow-hidden rounded-xl bg-black shadow-2xl"
      >
        {/* Floating close button */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/60 text-bone hover:bg-black hover:scale-105 transition-all"
          aria-label="Close trailer"
        >
          ✕
        </button>

        {/* Video container 16:9 aspect ratio */}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeKey}?autoplay=1&rel=0`}
            title={`${movieTitle} Official Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-quiet flex items-center gap-2"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        Trailer
      </button>

      {open && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
