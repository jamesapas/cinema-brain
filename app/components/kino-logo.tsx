import Link from "next/link";

import { KinoAvatar } from "@/app/components/kino-avatar";

/**
 * The single source of truth for the Kino logo lockup (Avatar + wordmark).
 *
 * Matches the original homepage header lockup style exactly across all pages:
 * text-2xl font-bold tracking-tight text-bone with mt-1 on the wordmark.
 */
export function KinoLogo({
  size = 40,
  href = "/",
  className = "",
}: {
  /** Size of the Kino avatar mark in pixels. Defaults to 40. */
  size?: number;
  /** Destination link target. Set to null to render a non-navigable container. Defaults to "/". */
  href?: string | null;
  /** Additional styling classes for outer positioning. */
  className?: string;
}) {
  const content = (
    <>
      <KinoAvatar size={size} />
      <span className="mt-1">Kino</span>
    </>
  );

  const baseClasses = `flex items-center gap-2 rounded text-2xl font-bold tracking-tight text-bone ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
