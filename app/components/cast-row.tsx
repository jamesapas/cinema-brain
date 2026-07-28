"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { MovieCastItem } from "@/lib/movies/catalog";
import { profileUrl } from "@/lib/movies/images";

export function CastRow({ items }: { items: MovieCastItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      setCanScroll({
        back: track.scrollLeft > 1,
        forward: track.scrollLeft < max - 1,
      });
    };

    update();
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  function scrollBy(direction: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * (track.clientWidth * 0.75), behavior: "smooth" });
  }

  return (
    <div className="group/row relative">
      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth touch-pan-x pb-3"
      >
        {items.map((person) => {
          const avatar = profileUrl(person.profile_path, "w185");
          return (
            <div
              key={person.id}
              className="flex w-24 shrink-0 snap-start flex-col items-center text-center sm:w-28"
            >
              <div className="relative size-16 overflow-hidden rounded-full bg-ink-raised ring-1 ring-ink-line sm:size-20">
                {avatar ? (
                  <Image
                    src={avatar}
                    alt={person.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm font-semibold text-bone-dim">
                    {person.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-semibold text-bone sm:text-sm">
                {person.name}
              </p>
              {person.character && (
                <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-bone-dim sm:text-xs">
                  {person.character}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop navigation arrows matching CarouselRow */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => scrollBy(-1)}
        className={`absolute -top-1 bottom-0 left-0 z-20 hidden w-16 items-center justify-center text-bone transition-opacity duration-200 hover:text-lamp lg:flex ${
          canScroll.back
            ? "bg-gradient-to-r from-ink via-ink/85 to-transparent opacity-0 group-hover/row:opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="rotate-180"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>

      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => scrollBy(1)}
        className={`absolute -top-1 bottom-0 right-0 z-20 hidden w-16 items-center justify-center text-bone transition-opacity duration-200 hover:text-lamp lg:flex ${
          canScroll.forward
            ? "bg-gradient-to-l from-ink via-ink/85 to-transparent opacity-0 group-hover/row:opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
