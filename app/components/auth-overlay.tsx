"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { ForgotPasswordForm } from "@/app/components/forgot-password-form";
import { TextField } from "@/app/components/text-field";
import { readableAuthError } from "@/lib/auth/errors";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Signing in, over whatever you were looking at.
 *
 * There is no /login route any more. Auth was the last thing on this site that
 * took the page away from you, which was backwards: you reach for it *because*
 * of something on the page — a star, Kino, your profile — and the page you
 * were on is the context for the whole exchange. So it opens the way search
 * and Kino open, and closing it leaves you exactly where you were. On success
 * nothing navigates at all: the panel closes and `router.refresh()` re-renders
 * the server components around it, so your stars simply fill in.
 *
 * The shape is search's and Kino's: a scrim you can click, `.overlay-card`
 * chrome, and the same rise-in. It uses `sheet-in` rather than `palette-in`
 * because, like Kino's panel, it's something summoned rather than a command
 * bar dropped from the top.
 */

export type Mode = "signin" | "signup" | "forgot";

type AuthOverlayContextValue = {
  /**
   * `reason` is the line above the heading — why they were asked. `mode` is
   * which form to land on: a "Sign up" button should open the panel already
   * showing the one it names, not the sign-in form with a link under it.
   */
  open: (reason?: string, mode?: Mode) => void;
};

const DEFAULT_AUTH_OVERLAY_CONTEXT: AuthOverlayContextValue = {
  open: () => {},
};

const AuthOverlayContext = createContext<AuthOverlayContextValue | null>(null);

export function useAuthOverlay() {
  const context = useContext(AuthOverlayContext);
  return context ?? DEFAULT_AUTH_OVERLAY_CONTEXT;
}

export function AuthOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("signin");

  const open = useCallback((why?: string, initialMode: Mode = "signin") => {
    setReason(why ?? null);
    setMode(initialMode);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Body scroll belongs to the panel while it's open, the same as the others.
  useEffect(() => {
    if (!isOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  return (
    <AuthOverlayContext.Provider value={{ open }}>
      {children}

      {isOpen && (
        <AuthOverlay
          reason={reason}
          initialMode={mode}
          onClose={() => setIsOpen(false)}
        />
      )}
    </AuthOverlayContext.Provider>
  );
}

/**
 * What each mode calls itself. The subtitle says what to do next in that
 * mode's own voice: an instruction, an invitation, and a request.
 */
const COPY: Record<Mode, { heading: string; subtitle: string }> = {
  signin: {
    heading: "Welcome back",
    subtitle: "Please log in to continue.",
  },
  signup: {
    heading: "Create an account",
    subtitle: "Get started with Kino",
  },
  forgot: {
    heading: "Reset your password",
    subtitle: "Tell us your email and we'll send a link to set a new one.",
  },
};

function AuthOverlay({
  reason,
  initialMode,
  onClose,
}: {
  reason: string | null;
  initialMode: Mode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  /** Signing in this is an email *or* a username; signing up it is the email. */
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Straight into the first field, the way search opens focused on its box.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  /** Anything that changes which form you're looking at clears what the last
      one had to say, so a stale error never sits above a different question. */
  function goTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      await signIn();
      return;
    }
    await signUp();
  }

  /**
   * Through the route rather than the browser client, because a username has
   * to be resolved to an email under service role before Supabase Auth will
   * take it. The route sets the same cookies the browser client would have.
   */
  async function signIn() {
    setBusy(true);

    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string | null;
    } | null;

    if (!response.ok) {
      setError(
        result?.error
          ? readableAuthError(result.code ?? undefined, result.error)
          : "Signing in failed. Try again.",
      );
      setBusy(false);
      return;
    }

    finish();
  }

  /**
   * No handle is sent. The signup trigger derives one from the email and walks
   * suffixes until it lands on a free one, which is also the only thing that
   * can happen on the Google path — so both routes get an account the same way
   * and the profile page is where anyone who minds picks their own.
   */
  async function signUp() {
    setBusy(true);
    const supabase = createBrowserSupabase();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: identifier.trim(),
      password,
    });
    if (signUpError) {
      setError(readableAuthError(signUpError.code, signUpError.message));
      setBusy(false);
      return;
    }
    if (!data.session) {
      setNotice("Account created. Confirm your email address, then sign in.");
      setMode("signin");
      setBusy(false);
      return;
    }

    finish();
  }

  /**
   * The auth cookies are written by now. No navigation: refresh re-renders the
   * page underneath with a session, and closing the panel hands it back
   * exactly as it was, now signed in.
   */
  function finish() {
    onClose();
    router.refresh();
  }

  /**
   * Google takes the browser away and back, so there's no `finish()` to call
   * here — `/auth/callback` does the redirect once the session exists, and
   * the panel just goes along for the ride.
   */
  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError(readableAuthError(oauthError.code, oauthError.message));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="scrim-in absolute inset-0 bg-ink/70 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-heading"
        className="flex flex-col items-center overlay-card sheet-in relative max-h-full w-full max-w-[27rem] overflow-y-auto px-5 py-6 sm:px-7"
      >
        {/* Floated into the corner rather than riding the heading's line, so
            the heading can sit centred with nothing pushing it off axis. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
        >
          <Icon icon="lucide:x" width={18} height={18} aria-hidden />
        </button>

        {/* Why they're looking at this, when something asked for it. */}
        {reason && <p className="label !text-lamp">{reason}</p>}

        {/* The subtitle says what to do next, in the words of the mode you're
            in: one is an instruction, the other an invitation. */}
        <div className={`px-8 mb-5 text-center ${reason ? "mt-2" : ""}`}>
          <h2 id="auth-heading" className="text-2xl font-semibold text-bone">
            {COPY[mode].heading}
          </h2>
          <p className="mt-1.5 text-sm text-bone-soft">{COPY[mode].subtitle}</p>
        </div>

        {/* Google is a way *in*. Offering it here would answer a question
            nobody asked — the person on this form has a password and can't use
            it, and a second door doesn't help them through the first. */}
        {mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={busy}
              className="btn btn-quiet mt-5 h-12 w-full text-base"
            >
              <GoogleMark />
              {mode === "signin" ? "Log in with Google" : "Sign up with Google"}
            </button>

            {/* Names what's below it rather than saying "or" into empty space. */}
            <div className="my-5 flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-ink-line" />
              <span className="meta !text-xs">or continue with email</span>
              <span className="h-px flex-1 bg-ink-line" />
            </div>
          </>
        )}

        {/* Forgot brings its own field, request, and messages — see
            forgot-password-form.tsx, which the expired-link page shares. */}
        {mode === "forgot" ? (
          <div className="mt-6 w-full">
            <ForgotPasswordForm autoFocus />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3.5">
            {/* Signing up this is the email and nothing else — the handle is
                derived from it. Signing in it takes either, since both land in
                the same place. */}
            <TextField
              id="identifier"
              label={mode === "signup" ? "Email" : "Email or username"}
              type={mode === "signup" ? "email" : "text"}
              value={identifier}
              onChange={setIdentifier}
              autoComplete={mode === "signup" ? "email" : "username"}
              inputRef={firstFieldRef}
            />

            {/* No confirm box beside it. A second password field asks everyone
                to type it twice to catch a typo the reveal toggle already shows
                them, and it was the last thing standing between a filled form
                and an account. */}
            <TextField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />

            {/* Under the box it's about, and only on the form where it's the
                answer. Right-aligned so it reads as an aside to the field
                rather than a third thing to fill in. */}
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => goTo("forgot")}
                className="-mt-1 self-end text-sm text-bone-soft decoration-bone-dim underline-offset-4 transition-colors hover:text-bone hover:underline"
              >
                Forgot password?
              </button>
            )}

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
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {/* The other door, named by the question that sends you through it.
            Forgot is a detour off sign-in rather than a door of its own, so it
            offers the way back instead of the way onward. */}
        <p className="mt-5 text-sm text-bone-soft">
          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => goTo("signin")}
              className="group inline-flex items-center gap-1.5 font-semibold text-bone transition-colors"
            >
              {/* The arrow is a drawn glyph like every other mark in the panel,
                  not a text arrow — those inherit the font and sit a shade off
                  the baseline of the label they point at. It leans into the
                  direction it means on hover. */}
              <Icon
                icon="lucide:arrow-left"
                width={15}
                height={15}
                aria-hidden
                className="transition-transform group-hover:-translate-x-0.5"
              />
              <span className="decoration-bone-dim underline-offset-4 group-hover:underline">
                Back to sign in
              </span>
            </button>
          ) : (
            <>
              {mode === "signin" ? "No account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => goTo(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-bone decoration-bone-dim underline-offset-4 transition-colors hover:underline"
              >
                {mode === "signin" ? "Sign up" : "Log in"}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Google's G, inline and in its own four colours.
 *
 * Not an Iconify glyph like the rest of the panel: those are stroked in
 * `currentColor`, and the one mark on this page that may not be recoloured is
 * this one.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07Z"
      />
    </svg>
  );
}
