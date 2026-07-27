"use client";

import { useEffect, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/browser";

import { DeadLink } from "./dead-link";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Works out, in the browser, whether the person standing here holds a live
 * recovery session — and it has to be the browser, because of where Supabase
 * puts the answer.
 *
 * The stock `{{ .ConfirmationURL }}` mail template sends the click to Supabase's
 * own /auth/v1/verify, which spends the token there and hands the session back
 * in the URL *fragment*: `#access_token=…`. A fragment is never transmitted to a
 * server, so the Server Component that used to make this decision saw an empty
 * request and called every link dead. Editing that template is the tidier fix,
 * but Supabase gates template editing behind custom SMTP — so the app meets the
 * default link where it lands instead.
 *
 * Three ways in, and they are tried in that order:
 *
 *   1. `?token_hash=` — a customised template. Handed to /auth/confirm, which
 *      verifies it server-side and comes back here with cookies already set.
 *      Kept working so that adding SMTP later needs no code change.
 *   2. `#access_token=` — the default template, read and exchanged here.
 *   3. an existing session — a reload after either of the above.
 */
type Phase = "checking" | "ready" | "dead";

export function ResetGate({ expired }: { expired: boolean }) {
  const [phase, setPhase] = useState<Phase>(expired ? "dead" : "checking");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (expired) return;

    let cancelled = false;

    async function resolve() {
      const supabase = createBrowserSupabase();

      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      // Route 1: let the server route do what it already does well.
      if (tokenHash && type) {
        window.location.replace(
          `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`,
        );
        return;
      }

      // Route 2: the fragment. Parsed rather than left to detectSessionInUrl,
      // so what happens here doesn't depend on which flow the client defaults
      // to — the tokens are right there and setSession is the whole exchange.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // Off the address bar before anything can copy it out of there, and
        // before a reload can try to spend it twice.
        window.history.replaceState(null, "", window.location.pathname);

        if (cancelled) return;
        if (error || !data.session) {
          console.error("[auth/reset] setSession", error);
          setPhase("dead");
          return;
        }

        setEmail(data.session.user.email ?? null);
        setPhase("ready");
        return;
      }

      // Route 3: already signed in — a reload, or arrival via /auth/confirm.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      if (!session) {
        setPhase("dead");
        return;
      }

      setEmail(session.user.email ?? null);
      setPhase("ready");
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [expired]);

  // Deliberately not a spinner: the checks above are a few milliseconds of
  // local work, and a spinner that flashes for one frame reads as a fault.
  if (phase === "checking") {
    return <p className="py-6 text-center text-sm text-bone-soft">Checking your link…</p>;
  }

  return phase === "ready" ? <ResetPasswordForm email={email} /> : <DeadLink />;
}
