/**
 * Supabase's auth errors, in the words of the person who hit one.
 *
 * The raw messages are written for whoever is reading a stack trace. These are
 * for whoever is staring at a form, so each one says what to do next rather
 * than what went wrong. Anything unrecognised passes through unchanged — a
 * message nobody anticipated still beats a vague one that hides it.
 *
 * Pure, and shared by the sign-in panel and the reset page, so the same failure
 * reads the same way whichever of the two you're standing in.
 */
export function readableAuthError(code: string | undefined, message: string): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return "Too many emails have gone out from this project in the last hour. Wait a few minutes, then try again.";
    case "invalid_credentials":
      return "That email and password don't match an account. Check both, or create an account.";
    case "user_already_exists":
    case "email_exists":
      return "An account already uses that email. Sign in instead.";
    case "weak_password":
      return "That password is too weak. Use at least six characters.";
    case "email_address_invalid":
      return "That email address was rejected. Use an address you can receive mail at.";
    case "email_not_confirmed":
      return "Confirm your email address first — check your inbox for the link.";
    case "same_password":
      return "That's already your password. Choose a different one.";
    // Both mean the link is spent. The reset page turns these into its own
    // copy, but a stray one reaching a form should still read as English.
    case "otp_expired":
    case "session_not_found":
      return "That link has expired. Ask for a new one.";
    default:
      return message;
  }
}
