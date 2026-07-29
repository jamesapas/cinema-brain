"use client";

import { useEffect, useState } from "react";

import { refreshTasteSummary } from "@/app/actions/taste-summary";
import { KinoAvatar } from "@/app/components/kino-avatar";

/** Truncates text cleanly at a word boundary around target length (~220 chars) */
function truncateAtWord(text: string, maxLen = 220) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 140 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Kino's read on a profile's taste.
 *
 * Renders whatever is cached on the profile row, which is the case on almost
 * every visit and costs nothing. Only when the owner is looking at their own
 * page *and* their ratings have moved since the paragraph was written does this
 * ask the server for a new one — a visitor never triggers a model call, no
 * matter how many times the page is loaded.
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
  const isLong = summary ? summary.length > 220 : false;
  const shortText = summary && isLong ? truncateAtWord(summary, 220) : summary;

  return (
    <section>
      <h2 className="text-xl font-bold text-bone">Summary</h2>

      <div className="mt-6 flex items-start gap-4">
        <KinoAvatar size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-kino">
            {`Kino describes ${isOwner ? "you" : name} as…`}
            {thinking && summary && (
              <span className="meta ml-2 !text-xs">· rereading your ratings</span>
            )}
          </p>

          {summary ? (
            <div
              onClick={isLong ? () => setExpanded((prev) => !prev) : undefined}
              className={`mt-2 max-w-2xl ${isLong ? "cursor-pointer" : ""}`}
            >
              <p key={summary} className="thinking-in leading-relaxed text-bone">
                {expanded || !isLong ? (
                  <>
                    {summary}
                    {isLong && <span className="ml-1.5 text-bone/70">Read less</span>}
                  </>
                ) : (
                  <>
                    {shortText}…{" "}
                    <span className="text-bone/70">Read more</span>
                  </>
                )}
              </p>
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
