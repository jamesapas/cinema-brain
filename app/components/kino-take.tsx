"use client";

import { useEffect, useRef, useState } from "react";

import { refreshTasteSummary } from "@/app/actions/taste-summary";
import { KinoAvatar } from "@/app/components/kino-avatar";

/**
 * Kino's read on a profile's taste.
 *
 * Renders whatever is cached on the profile row, which is the case on almost
 * every visit and costs nothing. Only when the owner is looking at their own
 * page *and* their ratings have moved since the paragraph was written does this
 * ask the server for a new one — a visitor never triggers a model call, no
 * matter how many times the page is loaded.
 *
 * The refresh happens here rather than during the server render so a stale
 * summary doesn't hold the whole profile behind a model call. The page paints
 * with the old paragraph (or a placeholder), and the new one replaces it.
 */
export function KinoTake({
  name,
  isOwner,
  summary: cached,
  stale,
  ratedCount,
  minRated,
}: {
  name: string;
  isOwner: boolean;
  summary: string | null;
  stale: boolean;
  ratedCount: number;
  minRated: number;
}) {
  const [summary, setSummary] = useState(cached);
  // Only the owner can write the row, so only the owner asks — and the initial
  // value is the answer for the whole life of the mount, since a finished
  // refresh revalidates the page rather than flipping `stale` underneath us.
  const [thinking, setThinking] = useState(isOwner && stale);

  useEffect(() => {
    if (!isOwner || !stale) return;

    let live = true;
    refreshTasteSummary()
      .then((result) => {
        if (!live) return;
        if (result.ok && result.summary) setSummary(result.summary);
      })
      .finally(() => {
        if (live) setThinking(false);
      });

    return () => {
      live = false;
    };
  }, [isOwner, stale]);

  return (
    <TakeSection
      name={name}
      isOwner={isOwner}
      summary={summary}
      thinking={thinking}
      ratedCount={ratedCount}
      minRated={minRated}
    />
  );
}

/**
 * The paragraph, clamped to four lines with a control to open it.
 *
 * Split out from `KinoTake` so the measuring state lives next to the element it
 * measures, and so a refresh arriving from the server doesn't drag the
 * expand/collapse state through the same render path.
 */
function TakeSection({
  name,
  isOwner,
  summary,
  thinking,
  ratedCount,
  minRated,
}: {
  name: string;
  isOwner: boolean;
  summary: string | null;
  thinking: boolean;
  ratedCount: number;
  minRated: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Whether the clamp is actually hiding anything. A two-sentence read fits in
  // four lines, and offering to expand what is already fully visible is worse
  // than not offering at all — so this is measured rather than assumed.
  const [clipped, setClipped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = textRef.current;
    // Nothing to measure while expanded, and measuring then would read "fits"
    // and take the control away mid-read.
    if (!element || expanded) return;

    // Fires once on observe, which is the initial measurement, and again on
    // every reflow — the same paragraph clips at one width and not another.
    const observer = new ResizeObserver(() => {
      setClipped(element.scrollHeight > element.clientHeight + 1);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [summary, expanded]);

  return (
    <section>
      <h2 className="text-xl font-bold text-bone">Summary</h2>

      <div className="mt-6 flex items-start gap-4">
        <KinoAvatar size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-kino">
            {/* The paragraph itself never says "you" — it is written once and read
                by the owner and every visitor, so only this line changes. Built as
                one string because JSX text around an expression loses its spacing
                depending on where the line wraps. */}
            {`Kino describes ${isOwner ? "you" : name} as…`}
            {/* Only worth saying while it replaces something already written —
                the placeholder below already reads as "not yet". */}
            {thinking && summary && (
              <span className="meta ml-2 !text-xs">· rereading your ratings</span>
            )}
          </p>

          {summary ? (
            <div className="relative mt-2 max-w-2xl">
              <p
                key={summary}
                ref={textRef}
                // `line-clamp-*` needs a literal class name to exist at build
                // time, so the count is a switch rather than an interpolation.
                className={`thinking-in leading-relaxed text-bone ${
                  expanded ? "" : "line-clamp-4"
                }`}
              >
                {summary}
                {/* Expanded, there is no clamp to sit on top of, so the control
                    just follows the final word. */}
                {expanded && clipped && (
                  <Toggle expanded onClick={() => setExpanded(false)} className="ml-2" />
                )}
              </p>

              {/* Collapsed, it rides the last visible line at the right edge,
                  fading the truncated text out beneath it instead of taking a
                  line of its own. Only rendered once the clamp is measured to be
                  hiding something, so a short read carries no dangling control. */}
              {!expanded && clipped && (
                <Toggle
                  expanded={false}
                  onClick={() => setExpanded(true)}
                  // The 4rem of padding is the fade itself: the gradient reaches
                  // solid ink right where the label starts, so the sentence
                  // dissolves into it rather than being cut off behind it.
                  className="absolute right-0 bottom-0 bg-linear-to-r from-transparent to-ink to-40% pl-16"
                />
              )}
            </div>
          ) : thinking ? (
            <Placeholder />
          ) : (
            <p className="mt-2 max-w-2xl text-lg leading-relaxed text-bone-soft">
              {ratedCount < minRated
                ? isOwner
                  ? `Rate ${minRated - ratedCount} more ${minRated - ratedCount === 1 ? "film" : "films"} and Kino will tell you what he makes of your taste.`
                  : `Not enough ratings yet for Kino to say anything honest about ${name}'s taste.`
                : "Kino hasn't written this one up yet."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The expand/collapse control.
 *
 * Carries the paragraph's own type scale rather than a smaller one: sitting on
 * the last line only looks deliberate if it shares that line's metrics, and the
 * gold weight is enough to read as a control without shrinking it.
 */
function Toggle({
  expanded,
  onClick,
  className = "",
}: {
  expanded: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`leading-relaxed font-semibold text-kino transition-colors hover:text-lamp ${className}`}
    >
      {expanded ? "Read less" : "Read more"}
    </button>
  );
}

/** Three lines of prose, roughly the length of the paragraph replacing them. */
function Placeholder() {
  return (
    <div className="mt-3 flex max-w-2xl flex-col gap-2.5" aria-hidden>
      <span className="skeleton block h-4 w-full rounded-full" />
      <span className="skeleton block h-4 w-[92%] rounded-full" />
      <span className="skeleton block h-4 w-[64%] rounded-full" />
    </div>
  );
}
