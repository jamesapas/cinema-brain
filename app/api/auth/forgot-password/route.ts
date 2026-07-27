import { looksLikeEmail } from "@/lib/auth/username";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/auth/forgot-password — sends the recovery link.
 *
 * Recovery asks for the address and only the address. A handle is something
 * you can forget alongside the password, and the account it names is reachable
 * only through the mailbox anyway — so the box asks for the one thing the link
 * has to be sent to. Signing in still takes either; see lib/auth/lookup.ts.
 *
 * That leaves no service-role lookup here, so this stays a route for the second
 * reason rather than the first: the mail is sent by the cookie client, so it
 * counts against Supabase's ordinary per-address throttle instead of bypassing
 * it — this endpoint is unauthenticated, and that throttle is most of what
 * stops it being used to post mail at somebody.
 */

/**
 * The only thing this endpoint ever says.
 *
 * Not "we sent it" and not "no such account" — the same sentence either way,
 * because any difference between the two turns this into a way to test which
 * addresses are registered. Same shape as REJECTED in the sign-in route next
 * door.
 */
const SENT = "If that matches an account, a reset link is on its way. Check your inbox.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const { email: typedEmail } = (body ?? {}) as { email?: unknown };
  if (typeof typedEmail !== "string") {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const email = typedEmail.trim();
  if (!email) {
    return Response.json({ error: "Enter your email address." }, { status: 400 });
  }

  // Shape only, and deliberately: whether an address is *registered* is the one
  // thing this endpoint refuses to reveal, so a well-formed unknown address gets
  // the same answer as a real one. A missing "@" is a typo the sender can see.
  if (!looksLikeEmail(email)) {
    return Response.json(
      { error: "That doesn't look like an email address." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();

  // The reset page, not /auth/confirm, because the stock mail template returns
  // the session in a URL fragment and only a browser can read one. The page's
  // gate forwards to /auth/confirm on its own if the link turns out to carry a
  // `token_hash` instead, so this one destination serves both templates.
  //
  // Supabase validates this against the project's redirect allow-list. Sending
  // it rather than relying on a fixed Site URL is what lets localhost and
  // production both work.
  const redirectTo = new URL("/auth/reset", new URL(request.url).origin).toString();

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Deliberately swallowed. Every failure here is one that only *can* happen for
  // an account that exists — the per-address throttle most of all — so reporting
  // any of them would undo the paragraph above. It goes to the server log, where
  // the person who can act on it will see it.
  if (error) console.error("[api/auth/forgot-password] send", error);

  return Response.json({ ok: true, message: SENT });
}
