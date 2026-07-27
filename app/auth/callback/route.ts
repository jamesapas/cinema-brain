import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /auth/callback — where Google sends the browser back after consent.
 *
 * The OAuth (PKCE) flow, unlike the email-link flow in `auth/confirm`, is
 * redeemed by the same browser that started it, so a `code` here is exchanged
 * for a session directly rather than routed through a token hash. Landing on
 * the homepage rather than a `next` param keeps this from doubling as an open
 * redirect.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] exchangeCodeForSession", error);
  }

  redirect("/");
}
