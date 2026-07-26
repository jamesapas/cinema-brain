"use client";

import { useRef } from "react";

import { PosterCard } from "@/app/components/poster-card";
import type { MovieCard } from "@/lib/movies/images";

/**
 * A horizontally scrolling shelf of posters.
 *
 * Native overflow scrolling does the work — touch, trackpad, and keyboard all
 * come free. The arrows are a desktop convenience layered on top, hidden from
 * assistive tech since they duplicate scrolling that already works.
 */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={direction === "left" ? "rotate-180" : undefined}
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function CarouselRow({
  title,
  note,
  movies,
  ratings,
  priority = false,
}: {
  title: string;
  note?: string;
  movies: MovieCard[];
  ratings: Record<number, number>;
  priority?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (movies.length === 0) return null;

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    // Roughly one screenful, so nothing gets skipped between presses.
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="group/row">
      {/* No horizontal padding of its own: the page container owns the gutter,
          so a heading and its first poster line up on the same edge. */}
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-bone sm:text-xl">{title}</h2>
          {note && <span className="meta hidden sm:inline">{note}</span>}
        </div>

        <div className="hidden gap-2 opacity-0 transition-opacity group-hover/row:opacity-100 lg:flex">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => scrollBy(-1)}
            className="grid h-8 w-8 place-items-center rounded-full border border-ink-line bg-ink-raised text-bone-soft transition-colors hover:border-lamp hover:text-lamp"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => scrollBy(1)}
            className="grid h-8 w-8 place-items-center rounded-full border border-ink-line bg-ink-raised text-bone-soft transition-colors hover:border-lamp hover:text-lamp"
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pt-1 pb-8"
      >
        {movies.map((movie, index) => (
          <PosterCard
            key={movie.id}
            movie={movie}
            rating={ratings[movie.id] ?? null}
            priority={priority && index < 6}
          />
        ))}
      </div>
    </section>
  );
}
