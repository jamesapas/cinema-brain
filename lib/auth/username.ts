/**
 * The rules for a handle, in one place.
 *
 * The database is the authority — `profiles_username_format` and the unique
 * index are what actually hold — but the signup form has to say the same thing
 * before it submits, so the shape lives here and both sides read it. Pure, and
 * safe to import from a client component.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Mirrors the check constraint exactly. */
const USERNAME_PATTERN = new RegExp(`^[a-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`);

/**
 * Stored lowercase, so typing "James" at the login box is typing "james".
 * Applied before validating and before sending, never only for display.
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** The reason it won't do, or null when it will. Phrased for a form. */
export function usernameProblem(value: string): string | null {
  const username = normalizeUsername(value);

  if (username.length < USERNAME_MIN) {
    return `Usernames are at least ${USERNAME_MIN} characters.`;
  }
  if (username.length > USERNAME_MAX) {
    return `Usernames are at most ${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Usernames can use letters, numbers, and underscores only.";
  }
  return null;
}

/**
 * Which of the two things someone typed into the sign-in box. An "@" is the
 * only signal needed: usernames cannot contain one.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}
