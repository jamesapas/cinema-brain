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

type Mode = "signin" | "signup";

type AuthOverlayContextValue = {
  /** `reason` is the line above the heading — why they were asked. */
  open: (reason?: string) => void;
};

const AuthOverlayContext = createContext<AuthOverlayContextValue | null>(null);

export function useAuthOverlay() {
  const context = useContext(AuthOverlayContext);
  if (!context) {
    throw new Error("useAuthOverlay must be used inside AuthOverlayProvider.");
  }
  return context;
}

export function AuthOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const open = useCallback((why?: string) => {
    setReason(why ?? null);
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

      {isOpen && <AuthOverlay reason={reason} onClose={() => setIsOpen(false)} />}
    </AuthOverlayContext.Provider>
  );
}

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

function AuthOverlay({ reason, onClose }: { reason: string | null; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);

  // Straight into the first field, the way search opens focused on its box.
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

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

    // The browser client has written the auth cookies. No navigation: refresh
    // re-renders the page underneath with a session, and closing the panel
    // hands it back exactly as it was, now signed in.
    onClose();
    router.refresh();
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
        className="overlay-card sheet-in relative max-h-full w-full max-w-[27rem] overflow-y-auto px-5 py-6 sm:px-7"
      >
        {/* Why they're looking at this, when something asked for it. */}
        {reason && <p className="label !text-lamp">{reason}</p>}

        {/* No subtitle: a form with an email and a password says what it is.
            Close rides the heading's line rather than floating in the corner. */}
        <div className={`flex items-center justify-between gap-4 ${reason ? "mt-2" : ""}`}>
          <h2 id="auth-heading" className="text-2xl font-bold text-bone">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
          >
            <Icon icon="lucide:x" width={18} height={18} aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
          <TextField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            inputRef={emailRef}
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

        {/* The other door, named by the question that sends you through it. */}
        <p className="mt-5 text-sm text-bone-soft">
          {mode === "signin" ? "No account? " : "Already have an account? "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-bone underline decoration-bone-dim underline-offset-4 transition-colors hover:decoration-lamp"
          >
            {mode === "signin" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

/** Email and password share the same filled box; only the reveal differs. */
function TextField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  inputRef,
}: {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete: string;
  minLength?: number;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>

      <div className="relative">
        {/* The glyph marks which box is which without adding another word. */}
        <Icon
          icon={isPassword ? "lucide:lock" : "lucide:mail"}
          width={17}
          height={17}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-bone-dim"
        />

        <input
          id={id}
          ref={inputRef}
          type={isPassword && revealed ? "text" : type}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`field-input ${isPassword ? "pr-11" : ""}`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={revealed}
            className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-bone-dim transition-colors hover:text-bone"
          >
            <Icon icon={revealed ? "lucide:eye-off" : "lucide:eye"} width={17} height={17} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
