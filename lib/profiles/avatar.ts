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
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
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
