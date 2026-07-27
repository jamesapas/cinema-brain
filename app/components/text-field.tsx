"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";

/**
 * Every auth field shares the same filled box; only the glyph and reveal differ.
 *
 * The name of the field is its placeholder rather than a line above it —
 * stacked labels made the sign-in panel read as a form to be filled out, when
 * it is two things to type. The label element stays, visually hidden, because a
 * placeholder is not a label to a screen reader and vanishes once you type.
 *
 * It lives out here rather than inside the sign-in panel because the reset page
 * is a page and the panel is a panel, and a password box that looked like two
 * different controls depending on which of those you arrived through would be
 * the seam showing.
 */
export function TextField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
  inputRef,
}: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  // Anything that isn't an email or a password is a person: their handle.
  const glyph = isPassword
    ? "lucide:lock"
    : type === "email"
      ? "lucide:mail"
      : "lucide:user";

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <div className="relative">
        {/* The glyph marks which box is which without adding another word. */}
        <Icon
          icon={glyph}
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
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={label}
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
