import Image from "next/image";

/**
 * Kino's face.
 *
 * One component so every appearance — the summon button, the panel header,
 * each thing he says — is the same crop at the same rendering, and changing
 * the character means replacing one file.
 *
 * The source is a transparent PNG, so no background is painted behind it; it
 * reads against ink and against a bubble equally. `alt` is empty because the
 * name is always written next to it, and a screen reader announcing "Kino"
 * twice is worse than not describing decoration.
 */
export function KinoAvatar({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/kino.png"
      alt=""
      width={size}
      height={size}
      // Fixed display size, so let the optimizer serve exactly what's needed
      // rather than the 1254px original.
      sizes={`${size}px`}
      className={`shrink-0 select-none ${className}`}
      priority
    />
  );
}
