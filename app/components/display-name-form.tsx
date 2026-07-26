"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateDisplayName } from "@/app/actions/profile";

/**
 * The one editable field on the profile. It stays a form rather than an
 * edit-in-place affordance so there is never a doubt about whether a change
 * was saved.
 */
export function DisplayNameForm({ value }: { value: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== (value ?? "").trim();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await updateDisplayName(name);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="display-name" className="label">
        Display name
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="display-name"
          value={name}
          maxLength={40}
          placeholder="Not set"
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          className="h-11 w-full max-w-xs rounded-md border border-ink-line bg-bone/8 px-3 text-bone placeholder:text-bone-dim focus:border-lamp focus:outline-none"
        />
        <button type="submit" disabled={busy || !dirty} className="btn btn-quiet">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && (
          <span role="status" className="meta !text-lamp">
            Saved
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-lamp">
          {error}
        </p>
      )}
    </form>
  );
}
