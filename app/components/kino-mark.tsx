/**
 * Kino's mark: a camera iris.
 *
 * Six blades, drawn as chords of one circle — each spans 120° from the last,
 * which is the geometry a real aperture makes and the reason the shape reads
 * as a lens rather than a generic asterisk. Rotating one chord six times is
 * also why this needs no gradient and no ids, so it can't cause the hydration
 * mismatch that random SVG ids caused elsewhere in this app.
 *
 * Stroke is `currentColor`, so the caller decides whether it is gold on ink or
 * ink on gold.
 */

const BLADES = 6;

/** Chord endpoints on an r=8.8 circle at 12,12, 120° apart. */
const BLADE = { x1: 12, y1: 3.2, x2: 19.62, y2: 16.4 };

export function KinoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="8.8" />
      {Array.from({ length: BLADES }, (_, index) => (
        <line
          key={index}
          x1={BLADE.x1}
          y1={BLADE.y1}
          x2={BLADE.x2}
          y2={BLADE.y2}
          transform={`rotate(${(index * 360) / BLADES} 12 12)`}
        />
      ))}
    </svg>
  );
}
