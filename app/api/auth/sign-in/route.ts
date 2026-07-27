import { looksLikeEmail, normalizeUsername } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let email: string;
  if (looksLikeEmail(typed)) {
    email = typed;
  } else {
    const resolved = await emailForUsername(normalizeUsername(typed));
    // A handle nobody holds fails exactly like a wrong password, and takes the
    // same path to get there.
    if (!resolved) return Response.json({ error: REJECTED }, { status: 401 });
    email = resolved;
  }

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

/** Service role: profiles are owner-read, and there is no owner here yet. */
async function emailForUsername(username: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("[api/auth/sign-in] username lookup", error);
    return null;
  }
  if (!profile) return null;

  const { data, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError) {
    console.error("[api/auth/sign-in] user lookup", userError);
    return null;
  }

  return data.user?.email ?? null;
}
