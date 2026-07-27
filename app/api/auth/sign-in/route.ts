import { emailForIdentifier } from "@/lib/auth/lookup";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/auth/sign-in — password sign-in by email *or* username.
 *
 * Supabase Auth only knows about the email, so a username has to be turned
 * into one first, and that lookup needs to read a profile row the caller does
 * not own yet — service role, therefore server-only, therefore this route
 * rather than the browser client. Nothing about the account comes back in the
 * response: the email is used and discarded here, so the endpoint cannot be
 * walked to map handles to email addresses.
 *
 * The sign-in itself runs on the cookie client, so the Set-Cookie headers ride
 * home on this response and the session is live for Server Components on the
 * very next request. The overlay just calls `router.refresh()`.
 */

/** One message for every way this can fail, so it names nothing. */
const REJECTED = "That email or username and password don't match an account.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const { identifier, password } = (body ?? {}) as {
    identifier?: unknown;
    password?: unknown;
  };

  if (typeof identifier !== "string" || typeof password !== "string") {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const typed = identifier.trim();
  if (!typed || !password) {
    return Response.json({ error: "Enter both fields." }, { status: 400 });
  }

  // A handle nobody holds fails exactly like a wrong password, and takes the
  // same path to get there.
  const email = await emailForIdentifier(typed);
  if (!email) return Response.json({ error: REJECTED }, { status: 401 });

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // `invalid_credentials` is the one the wording above already covers; the
    // rest (unconfirmed email, rate limits) say something the person can act
    // on, so they pass through for the overlay to translate.
    const code = error.code ?? null;
    return Response.json(
      {
        error: code === "invalid_credentials" ? REJECTED : error.message,
        code: code === "invalid_credentials" ? null : code,
      },
      { status: error.status ?? 401 },
    );
  }

  return Response.json({ ok: true });
}
