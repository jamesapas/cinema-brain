"use client";

import { useSignIn } from "@/app/components/session";

/**
 * The in-page version of the ask, for a route a signed-out visitor can reach
 * but not fill — /profile being the only one.
 *
 * A card on the page rather than a redirect, because sign-in is no longer
 * somewhere to be sent. The button opens the same panel every other control
 * opens, and on success the page behind it re-renders as the real thing.
 */
export function SignInPrompt({
  heading,
  body,
  reason,
}: {
  heading: string;
  body: string;
  /** The line the panel shows above its form. */
  reason: string;
}) {
  const signIn = useSignIn();

  return (
    <div className="max-w-md rounded-lg border border-ink-line bg-ink-raised px-6 py-10 text-center sm:px-10">
      <h1 className="text-2xl font-bold text-bone">{heading}</h1>
      <p className="mt-3 leading-relaxed text-bone-soft">{body}</p>
      <button
        type="button"
        onClick={() => signIn(reason)}
        className="btn btn-primary mt-7 h-11 px-6"
      >
        Sign in
      </button>
    </div>
  );
}
