import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — where every link we mail out comes back to.
 *
 * The link carries a `token_hash` rather than a PKCE code, which is the whole
 * reason this route exists in this shape: a hash can be redeemed by whichever
 * browser opens it. Asking for the link on a laptop and tapping it on a phone
 * is how people actually read their email, and the PKCE flow — which needs the
 * verifier cookie the asking browser stored — would die there.
 *
 * `verifyOtp` writes the session cookies, and they ride out on the redirect:
 * this is a Route Handler, so `cookies().set()` reaches the response even
 * though `redirect()` throws to produce it.
 */

/**
 * Where each kind of link goes once it's been redeemed — and, by being the only
 * source of that destination, the reason there's no `next` query parameter to
 * point somewhere else. A route that hands out sessions and takes its
 * redirect from the URL is an open redirect with extra steps.
 *
 * One entry today. Signup confirmation is a line here plus its own template.
 */
const DESTINATIONS: Partial<Record<EmailOtpType, string>> = {
  recovery: "/auth/reset",
};

/** Anything that didn't work says so in the one place that can offer a retry. */
const DEAD_LINK = "/auth/reset?expired=1";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Every rejection below sends the same person to the same page, so the reason
  // has to be written down somewhere or it's gone. Arriving with no parameters
  // at all is the signal worth recognising: it means the mail template is still
  // the stock `{{ .ConfirmationURL }}`, which spends the token at Supabase and
  // returns the session in a URL fragment — and a fragment never reaches a
  // server. Nothing about the link is wrong; it was addressed to the browser.
  if (!tokenHash || !type) {
    console.error(
      "[auth/confirm] rejected: no token_hash/type in the query.",
      "Received:", JSON.stringify([...searchParams.keys()]),
      "— if this is empty, the Reset Password email template is still the default;",
      "it must be `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`.",
    );
    redirect(DEAD_LINK);
  }

  const destination = DESTINATIONS[type];
  if (!destination) {
    console.error(`[auth/confirm] rejected: unsupported link type "${type}".`);
    redirect(DEAD_LINK);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error("[auth/confirm] verifyOtp", error);
    redirect(DEAD_LINK);
  }

  redirect(destination);
}
