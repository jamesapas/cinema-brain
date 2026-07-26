"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AskAboutButton } from "@/app/components/chat-overlay";
import { MovieMeta } from "@/app/components/movie-meta";
import { StarRating } from "@/app/components/star-rating";
import { backdropUrl, type MovieCard } from "@/lib/movies/images";

/**
 * Through to the featured film's page.
 *
 * A link inside the draggable surface is safe for the same reason the old
 * button was: the drag is measured on release, and a click travels ~0px.
 */
function MoreInfoLink({ movieId }: { movieId: number }) {
  return (
    <Link href={`/movie/${movieId}`} className="btn btn-quiet">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.25" />
        <path d="M12 11v5.5M12 7.6v.1" />
      </svg>
      More info
    </Link>
  );
}

/** Overviews run long; the hero wants a taste, not the whole synopsis. */
function blurb(overview: string | null, max = 180) {
  if (!overview) return null;
  if (overview.length <= max) return overview;
  const cut = overview.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "));
  return `${(lastStop > 90 ? cut.slice(0, lastStop) : cut).trimEnd()}…`;
}

/** How long each film holds the slot before the next one takes it. */
const DWELL_MS = 7000;

/** Horizontal travel that counts as a swipe rather than a click. */
const DRAG_THRESHOLD_PX = 60;

/**
 * The featured slot, rotating.
 *
 * It shows what's trending rather than one hand-picked film, and it no longer
 * skips films you've rated — your own score rides along on the stars, so a
 * film you know is worth featuring too.
 *
 * Every backdrop is stacked and crossfaded rather than swapped, because a hard
 * cut on an image this size reads as the page breaking. Only the first loads
 * eagerly: it's the LCP element, and the rest have seconds of warning.
 */
export function Hero({
  movies,
  ratings,
}: {
  movies: MovieCard[];
  ratings: Record<number, number>;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mayAnimate, setMayAnimate] = useState(true);

  const dragStartX = useRef<number | null>(null);

  const count = movies.length;

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  // Someone who has asked for less motion has not asked to watch a slideshow.
  // Checked in an effect so the server and the first client render agree.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMayAnimate(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || !mayAnimate || count < 2) return;
    const id = setInterval(() => go(1), DWELL_MS);
    return () => clearInterval(id);
  }, [paused, mayAnimate, count, go, index]);

  if (count === 0) return null;

  const movie = movies[index];
  const text = blurb(movie.overview);

  /**
   * Drag is measured, not tracked: the slide doesn't follow the pointer, it
   * commits on release. A click on one of the buttons travels ~0px and so
   * never registers as a swipe, which is what lets the whole surface be
   * draggable without stealing their clicks.
   */
  function onPointerDown(event: React.PointerEvent) {
    dragStartX.current = event.clientX;
    setPaused(true);
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartX.current;
    dragStartX.current = null;
    setPaused(false);
    if (start === null) return;

    const travelled = event.clientX - start;
    if (Math.abs(travelled) < DRAG_THRESHOLD_PX) return;
    go(travelled < 0 ? 1 : -1);
  }

  return (
    // The artwork bleeds the full width of the viewport and runs under the
    // fixed header; the text on top of it stays in the page container, so the
    // title lines up with the shelf headings below.
    <section
      aria-roledescription="carousel"
      aria-label="Featured films"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStartX.current = null;
        setPaused(false);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      // pan-y so a vertical scroll still belongs to the page; only horizontal
      // travel is ours.
      className="relative isolate min-h-[62vh] w-full touch-pan-y overflow-hidden select-none sm:min-h-[70vh]"
    >
      {movies.map((slide, slideIndex) => {
        const backdrop = backdropUrl(slide.backdrop_path);
        if (!backdrop) return null;

        return (
          <Image
            key={slide.id}
            src={backdrop}
            alt=""
            fill
            priority={slideIndex === 0}
            sizes="100vw"
            className={`object-cover object-top transition-opacity duration-700 ease-out ${
              slideIndex === index ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}

      {/*
        Two gradients: one lifts the text off the image, one blends the bottom
        edge into the first row of posters so there's no hard seam.

        Both carry explicit stops rather than an even ramp, which is what lets
        the artwork through. An even ramp spends its darkness across the whole
        width — it was still at 85% ink halfway across, over image nobody
        needed covered. Held dark only under the copy and dropped early, the
        left stays as readable as it was and the right two-thirds of the film
        is actually visible.
      */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink from-8% via-ink/55 via-42% to-transparent to-78%" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 via-32% to-transparent to-72%" />

      <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
        {/* Keyed on the film, so the copy fades in with the backdrop instead of
            the old title sitting over the new image for a beat. */}
        <div key={movie.id} className="result-in max-w-xl">
          <h1 className="mt-2 text-4xl leading-[1.02] font-bold text-bone sm:text-5xl lg:text-6xl">
            {movie.title}
          </h1>

          <MovieMeta movie={movie} className="mt-3 !text-sm" />

          {text && <p className="mt-4 max-w-lg leading-relaxed text-bone-soft">{text}</p>}

          {/* Stars sit in the same row as the actions, at the same size they
              are on a poster — rating the featured film is the same gesture as
              rating anything in a shelf, so it shouldn't look like a different
              control. The group carries its own accessible name, so it needs
              no visible "Your rating" heading. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-5">
            {/*
              inline-grid with two equal fractions: the pair sizes to whichever
              label is longer and both then match it, so "Ask Kino" and "More
              info" read as one control group rather than two buttons that
              happen to sit together.
            */}
            <div className="inline-grid grid-cols-2 gap-3 [&>a]:w-full [&>button]:w-full">
              <AskAboutButton title={movie.title} />
              <MoreInfoLink movieId={movie.id} />
            </div>
            <StarRating
              movieId={movie.id}
              rating={ratings[movie.id] ?? null}
              size="lg"
            />
          </div>
        </div>

        {count > 1 && (
          <div className="mt-9 flex items-center gap-2">
            {movies.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIndex(slideIndex)}
                aria-label={`Show ${slide.title}`}
                aria-current={slideIndex === index}
                // A line rather than a dot: it reads as position along a strip,
                // and gives a target big enough to actually hit.
                className={`h-1 rounded-full transition-all duration-300 ${
                  slideIndex === index
                    ? "w-8 bg-bone"
                    : "w-4 bg-bone/30 hover:bg-bone/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
