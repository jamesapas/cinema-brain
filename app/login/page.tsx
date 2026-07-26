"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/browser";

type Mode = "signin" | "signup";

/**
 * Supabase's raw auth errors are written for developers. Translate the ones
 * people actually hit into something that says what to do next; anything
 * unrecognized passes through rather than being hidden behind a vague message.
 */
function readableAuthError(code: string | undefined, message: string): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return "Too many confirmation emails have gone out from this project in the last hour. Wait a few minutes, then try again.";
    case "invalid_credentials":
      return "That email and password don't match an account. Check both, or create an account.";
    case "user_already_exists":
    case "email_exists":
      return "An account already uses that email. Sign in instead.";
    case "weak_password":
      return "That password is too weak. Use at least six characters.";
    case "email_address_invalid":
      return "That email address was rejected. Use an address you can receive mail at.";
    case "email_not_confirmed":
      return "Confirm your email address first — check your inbox for the link.";
    default:
      return message;
  }
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {hidden ? (
        <>
          <path d="M9.9 5.6A9 9 0 0 1 12 5.4c6.6 0 10.2 6.6 10.2 6.6a17.4 17.4 0 0 1-2.7 3.6" />
          <path d="M6.5 7.4A17.6 17.6 0 0 0 1.8 12S5.4 18.6 12 18.6a9.7 9.7 0 0 0 4-.8" />
          <path d="M14.1 14.3a3.2 3.2 0 0 1-4.4-4.5" />
          <path d="m3 3 18 18" />
        </>
      ) : (
        <>
          <path d="M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12Z" />
          <circle cx="12" cy="12" r="3.2" />
        </>
      )}
    </svg>
  );
}

/** Email and password share the same filled box; only the reveal differs. */
function TextField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <input
        id={id}
        type={isPassword && revealed ? "text" : type}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // The label floats off a placeholder-shown check, so the placeholder
        // has to exist and has to be blank.
        placeholder=" "
        className={`field-input ${isPassword ? "pr-12" : ""}`}
      />
      <label htmlFor={id} className="field-label">
        {label}
      </label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={revealed}
          className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-bone-dim transition-colors hover:text-bone"
        >
          <EyeIcon hidden={revealed} />
        </button>
      )}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setConfirmPassword("");
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    // Checked before the request so a typo costs nothing and the message can
    // name the actual problem.
    if (mode === "signup" && password !== confirmPassword) {
      setError("Those passwords don't match. Retype them and try again.");
      return;
    }

    setBusy(true);
    const supabase = createBrowserSupabase();

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(readableAuthError(signInError.code, signInError.message));
        setBusy(false);
        return;
      }
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
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
        setConfirmPassword("");
        setBusy(false);
        return;
      }
    }

    // The browser client has written the auth cookies; refresh so the server
    // sees the session and the proxy stops redirecting here.
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="cinema-backdrop film-grain relative flex min-h-full flex-1 flex-col">
      <header className="relative z-10 px-6 py-6 sm:px-12">
        <span className="text-2xl font-bold tracking-tight text-lamp">Cinema Brain</span>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pt-2 pb-16 sm:px-6">
        <div className="w-full max-w-[27rem] rounded-lg bg-ink/75 px-6 py-10 shadow-2xl ring-1 ring-bone/10 backdrop-blur-md sm:px-12 sm:py-12">
          <h1 className="text-3xl font-bold text-bone">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-2 leading-relaxed text-bone-soft">
            {mode === "signin"
              ? "A catalog you can talk to. It reads your ratings before it recommends anything."
              : "Rate a few films and the recommendations start following your taste."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <TextField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />

            <TextField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />

            {mode === "signup" && (
              <TextField
                id="confirm-password"
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                minLength={6}
                autoComplete="new-password"
              />
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

          <p className="mt-8 text-bone-dim">
            {mode === "signin" ? "New to Cinema Brain?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-bone underline decoration-bone-dim underline-offset-4 transition-colors hover:decoration-lamp"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
