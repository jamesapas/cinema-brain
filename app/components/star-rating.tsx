"use client";

import { useId, useState, useTransition } from "react";

import { clearRating, rateMovie } from "@/app/actions/rate-movie";

/**
 * Five stars in half-star steps. Each half is one point of the stored 1-10
 * rating, so 4.5 stars is 9 — the full column range stays reachable.
 *
 * Every half is its own button rather than one pointer-position calculation, so
 * it works by keyboard and touch, not just precise mouse aim.
 */
/**
 * Star box sizes. `card` is the only responsive one: a poster is 8rem on a
 * phone and 14rem from `lg`, and stars that don't shrink with it take the whole
 * card. Sized by class rather than an inline `width`, which can't hold a
 * breakpoint.
 */
const SIZE_CLASS = {
  sm: "size-[15px]",
  lg: "size-[22px]",
  card: "size-4 sm:size-[22px]",
} as const;

export function StarRating({
  movieId,
  rating,
  size = "sm",
}: {
  movieId: number;
  /** Stored 1-10 value, or null when unrated. */
  rating: number | null;
  size?: keyof typeof SIZE_CLASS;
}) {
  const [saved, setSaved] = useState<number | null>(rating);
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only startTransition is used. There is deliberately no busy state: the
  // stars are already showing the new rating, so dimming them while the write
  // lands would be telling you the thing you can see happened hasn't.
  const [, startTransition] = useTransition();

  const shown = preview ?? saved ?? 0;

  function submit(value: number) {
    const previous = saved;
    // Clicking the current value again clears it — the only way to undo a
    // misclick without a separate control.
    const next = value === saved ? null : value;

    // Optimistic: the stars move now and stay put. The write is only ever
    // visible again if it fails, in which case the value below rolls back and
    // says why.
    setSaved(next);
    setError(null);

    startTransition(async () => {
      const result = next === null ? await clearRating(movieId) : await rateMovie(movieId, next);
      if (!result.ok) {
        setSaved(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label={
          saved === null ? "Rate this film" : `Your rating: ${saved / 2} of 5 stars`
        }
        className="flex items-center gap-px"
        onMouseLeave={() => setPreview(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const leftValue = star * 2 - 1;
          const rightValue = star * 2;
          return (
            <span key={star} className={`relative inline-block ${SIZE_CLASS[size]}`}>
              <StarGlyph fill={fillFor(shown, star)} />
              {/* Two invisible hit targets per star: left half, right half. */}
              <button
                type="button"
                aria-label={`Rate ${leftValue / 2} of 5 stars`}
                onClick={() => submit(leftValue)}
                onMouseEnter={() => setPreview(leftValue)}
                onFocus={() => setPreview(leftValue)}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
              />
              <button
                type="button"
                aria-label={`Rate ${rightValue / 2} of 5 stars`}
                onClick={() => submit(rightValue)}
                onMouseEnter={() => setPreview(rightValue)}
                onFocus={() => setPreview(rightValue)}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
              />
            </span>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="font-mono text-[0.625rem] leading-tight text-lamp">
          {error}
        </p>
      )}
    </div>
  );
}

type Fill = "empty" | "half" | "full";

function fillFor(shown: number, star: number): Fill {
  if (shown >= star * 2) return "full";
  if (shown === star * 2 - 1) return "half";
  return "empty";
}

function StarGlyph({ fill }: { fill: Fill }) {
  // useId, not a random string: a random gradient id differs between the server
  // and client renders and trips a hydration mismatch.
  const id = `star-half-${useId()}`;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Fills the span, which is what carries the (possibly responsive) size.
      className="pointer-events-none block h-full w-full"
    >
      {fill === "half" && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="var(--color-lamp)" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
        fill={
          fill === "full"
            ? "var(--color-lamp)"
            : fill === "half"
              ? `url(#${id})`
              : "transparent"
        }
        stroke="var(--color-lamp)"
        strokeWidth="1.3"
        strokeLinejoin="round"
        opacity={fill === "empty" ? 0.45 : 1}
      />
    </svg>
  );
}
