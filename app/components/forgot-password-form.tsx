"use client";

import { useEffect, useRef, useState } from "react";

import { TextField } from "@/app/components/text-field";

/**
 * Asking for a reset link.
 *
 * Its own component because it's needed in two places that share nothing else:
 * the sign-in panel, where forgetting your password is a detour off the form
 * you're already failing at, and the expired-link page, where it's the only
 * thing to do. The alternative was for the dead page to bounce you home and
 * spring the panel open behind your back, which is a long way to travel for one
 * text box.
 *
 * It owns its own field and messages, which is the point: the parent decides
 * where it sits and what's written above it, and nothing about its state has to
 * be threaded through a form that also does sign-in.
 */
export function ForgotPasswordForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fieldRef = useRef<HTMLInputElement>(null);

  // The panel opens focused on its box the way search does. The page doesn't:
  // it has a heading to read first, and stealing focus would scroll past it.
  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, [autoFocus]);

  /**
   * Through a route rather than the browser client so the send counts against
   * Supabase's per-address throttle — see the handler for why that matters on
   * an endpoint anyone can reach.
   *
   * The response says the same thing whether or not the account exists, so
   * there is nothing here to branch on — success is the only outcome the caller
   * ever sees, and the form stays put showing it.
   */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      setError(result?.error ?? "Couldn't send that link. Try again.");
      setBusy(false);
      return;
    }

    setNotice(
      result?.message ?? "If that matches an account, a reset link is on its way.",
    );
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5">
      {/* The address, not the handle: a handle is forgettable alongside the
          password, and the link has to be mailed somewhere regardless. `email`
          also gets the browser's own check and its saved-address autofill. */}
      <TextField
        id="reset-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
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
      {notice && (
        <p
          role="status"
          className="rounded-md border-l-2 border-bone-dim bg-bone/5 px-3 py-2.5 text-sm leading-relaxed text-bone-soft"
        >
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary mt-2 h-12 w-full text-base"
      >
        {busy ? "Working…" : "Send reset link"}
      </button>
    </form>
  );
}
