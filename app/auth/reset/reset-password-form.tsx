"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TextField } from "@/app/components/text-field";
import { readableAuthError } from "@/lib/auth/errors";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Choosing the new password, at the end of the reset link.
 *
 * Straight to the browser client: /auth/confirm already turned the token into
 * a session, so this is an ordinary authenticated `updateUser` and there is
 * nothing for a route to add. No old-password box for the same reason — the
 * link out of a mailbox only that account can read is what proved it, and the
 * whole point is that they don't remember the old one.
 *
 * No confirm-password box either, matching the sign-up form: a second field
 * asks everyone to type it twice to catch a typo the reveal toggle already
 * shows them.
 */
export function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldRef = useRef<HTMLInputElement>(null);

  // There is exactly one thing to do on this page, so it starts focused on it.
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createBrowserSupabase();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(readableAuthError(updateError.code, updateError.message));
      setBusy(false);
      return;
    }

    // Already signed in — redeeming the link is what signed them in. So this
    // ends on the catalog rather than at a sign-in box asking them to prove,
    // with the password they set one second ago, something they just proved.
    // `replace` so Back doesn't return to a page whose link is now spent.
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center">
      <div className="px-6 text-center">
        <h1 className="text-2xl font-semibold text-bone">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-bone-soft">
          {/* Which account, in case the link was one of several in the inbox. */}
          {email ? <>You&rsquo;re setting the password for {email}.</> : "Pick something you'll remember."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex w-full flex-col gap-3.5">
        <TextField
          id="new-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          minLength={6}
          autoComplete="new-password"
          inputRef={fieldRef}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md border-l-2 border-lamp bg-lamp/10 px-3 py-2.5 text-sm leading-relaxed text-lamp"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary mt-2 h-12 w-full text-base"
        >
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
