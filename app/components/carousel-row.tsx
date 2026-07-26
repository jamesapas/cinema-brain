"use client";

import { useEffect, useRef, useState } from "react";

import { PosterCard } from "@/app/components/poster-card";
import type { MovieCard } from "@/lib/movies/images";

/**
 * A horizontally scrolling shelf of posters.
 *
 * Native overflow scrolling does the work — touch, trackpad, and keyboard all
 * come free. The arrows are a desktop convenience layered over the ends of the
 * track, hidden from assistive tech since they duplicate scrolling that
 * already works.
 */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="34"
      height="34"
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
  // Which arrows are worth showing. An arrow at the end of its travel is a
  // dead control, so it goes away rather than sitting there doing nothing.
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      setCanScroll({
        // 1px of slack: fractional scroll positions never land on exactly 0.
        back: track.scrollLeft > 1,
        forward: track.scrollLeft < max - 1,
      });
    };

    update();
    track.addEventListener("scroll", update, { passive: true });
    // The row reflows on resize and when images finish loading, both of which
    // change whether there is anywhere left to scroll.
    const observer = new ResizeObserver(update);
    observer.observe(track);

    return () => {
      track.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [movies]);

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
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-bone sm:text-xl">{title}</h2>
        {note && <span className="meta hidden sm:inline">{note}</span>}
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pt-1 pb-4"
        >
          {movies.map((movie, index) => (
            <PosterCard
              key={movie.id}
              movie={movie}
              rating={ratings[movie.id] ?? null}
              priority={priority && index < 5}
            />
          ))}
        </div>

        {/* Sized to the artwork, which the title and stars now sit below. */}
        <ScrollArrow
          direction="left"
          visible={canScroll.back}
          onClick={() => scrollBy(-1)}
        />
        <ScrollArrow
          direction="right"
          visible={canScroll.forward}
          onClick={() => scrollBy(1)}
        />
      </div>
    </section>
  );
}

function ScrollArrow({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      onClick={onClick}
      // Square, and no blur: a uniform blur across a fading strip leaves a hard
      // seam where the gradient runs out. The fade does the separating instead,
      // so the artwork is never cut by a panel edge.
      // Height is anchored to the poster rather than the track: the card's
      // title and stars are in flow below the artwork now, and their height
      // varies with how long a title wraps, so there's no stable bottom edge
      // to pin to. A 14rem card is 21rem of artwork (2:3), plus the 8px
      // overhang at each end.
      //
      // z-20 ties with the poster's click target and wins on DOM order, while
      // staying under the header's z-30 — at z-30 the strip painted over the
      // wordmark, since it comes later in the document.
      className={`absolute -top-1 z-20 hidden h-[22rem] w-20 items-center justify-center text-bone transition-opacity duration-200 hover:text-lamp lg:flex xl:w-24 ${
        direction === "left"
          ? "left-0 bg-gradient-to-r from-ink via-ink/85 to-transparent"
          : "right-0 bg-gradient-to-l from-ink via-ink/85 to-transparent"
      } ${visible ? "opacity-0 group-hover/row:opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <Chevron direction={direction} />
    </button>
  );
}
