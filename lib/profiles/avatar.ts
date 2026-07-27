/**
 * Pure avatar helpers, safe to import from client components.
 *
 * Same rule as lib/movies/images.ts: nothing here may import anything
 * server-only, because the header and the uploader both run in the browser.
 */

import { publicEnv } from "@/lib/env";

export const AVATARS_BUCKET = "avatars";

/**
 * The bucket is public, so an object's URL is derivable from its path and
 * needs no signing round trip. Paths carry a random uuid, so the URL still
 * isn't guessable from a user id alone.
 *
 * `providerAvatarUrl` is the OAuth provider's own picture (Google) — the
 * default for an account that has never uploaded one. An upload always wins
 * once it exists, which is why `path` is checked first.
 */
export function avatarUrl(
  path: string | null | undefined,
  providerAvatarUrl?: string | null,
): string | null {
  if (path) return `${publicEnv.supabaseUrl}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
  return providerAvatarUrl ?? null;
}

/**
 * Google's own picture, straight from the auth session's metadata — no copy
 * of it lives in `profiles`. `avatar_url` and `picture` are the same value
 * under two different keys depending on when the grant happened, so both are
 * checked.
 */
export function providerAvatarFrom(userMetadata: Record<string, unknown> | null | undefined): string | null {
  const value = userMetadata?.avatar_url ?? userMetadata?.picture;
  return typeof value === "string" && value ? value : null;
}

/** What the header shows before anyone has uploaded anything. */
export function initialsFor(displayName: string | null, email: string): string {
  const name = displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return email.trim().charAt(0).toUpperCase() || "?";
}

/** The name to greet someone by when they haven't set one. */
export function displayNameFor(displayName: string | null, email: string): string {
  return displayName?.trim() || email.split("@")[0];
}
