"use client";

import { useState } from "react";

/** Truncates text cleanly at a word boundary around target length */
function truncateAtWord(text: string, maxLen = 210) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 140 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Movie overview for the detail page.
 * On mobile screens, long overviews are cleanly truncated to ~5 lines ending
 * with a smooth "... Read more" inline toggle.
 */
export function MovieOverview({ overview }: { overview: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isLong = overview.length > 210;

  if (!isLong) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-bone-soft sm:mt-5 sm:text-sm sm:leading-relaxed">
        {overview}
      </p>
    );
  }

  const shortText = truncateAtWord(overview, 210);

  return (
    <div
      onClick={() => setIsExpanded((prev) => !prev)}
      className="mt-3 cursor-pointer text-xs leading-relaxed text-bone-soft sm:mt-5 sm:cursor-default sm:text-sm sm:leading-relaxed"
    >
      {/* Mobile view: Inline smooth ellipsis + Read more / Read less */}
      <p className="sm:hidden">
        {isExpanded ? (
          <>
            {overview}{" "}
            <span className="text-bone-soft/80">Read less</span>
          </>
        ) : (
          <>
            {shortText}…{" "}
            <span className="text-bone-soft/80">Read more</span>
          </>
        )}
      </p>

      {/* Desktop view: Full overview text */}
      <p className="hidden sm:block">{overview}</p>
    </div>
  );
}
