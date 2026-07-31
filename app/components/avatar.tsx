import Image from "next/image";

/**
 * A user's picture, or their initials when there isn't one.
 *
 * The placeholder is deliberately not a generic silhouette: initials on the
 * lamp gold read as "this is you, and you haven't set one yet" rather than as
 * a missing image.
 */
export function Avatar({
  url,
  initials,
  size = 36,
  className = "",
}: {
  url: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  const hasCustomDimensions = /\b(w-|h-|size-)/.test(className);
  const style = hasCustomDimensions ? undefined : { width: size, height: size };

  if (!url) {
    return (
      <span
        style={{ ...style, fontSize: hasCustomDimensions ? undefined : Math.max(11, Math.round(size * 0.38)) }}
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center text-center leading-none rounded-full bg-lamp/20 font-semibold text-lamp ring-1 ring-lamp/30 text-xs sm:text-sm ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      style={style}
      className={`skeleton relative block shrink-0 overflow-hidden rounded-full ${className}`}
    >
      {/* next/image resizes it, so a 512px upload isn't shipped whole into a
          36px hole. */}
      <Image src={url} alt="" fill sizes={`${size}px`} className="object-cover" />
    </span>
  );
}
