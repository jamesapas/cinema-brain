"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  removeAvatar,
  setAvatar,
  updateDisplayName,
  updateUsername,
} from "@/app/actions/profile";
import { Avatar } from "@/app/components/avatar";
import { normalizeUsername, USERNAME_MAX } from "@/lib/auth/username";
import { AVATARS_BUCKET } from "@/lib/profiles/avatar";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * The controls that change who you are, on their own page.
 *
 * They used to unfold from a pencil at the top of the profile, which put an
 * account form in the middle of a page for reading your own history — and
 * repeated your face and name directly under the rail's copy of both. Settings
 * is a place now, so each thing gets a labelled row and room to breathe.
 */

/** What we store, regardless of what came off the camera. */
const OUTPUT_SIZE = 512;
const OUTPUT_TYPE = "image/jpeg";
const OUTPUT_QUALITY = 0.88;

/**
 * Centre-crops to a square and downscales before upload.
 *
 * Doing this in the browser means a 6 MB phone photo never crosses the wire,
 * the bucket's 2 MB limit is never the thing that reports the error, and the
 * stored image matches the circle it will be displayed in.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - edge) / 2;
  const sy = (bitmap.height - edge) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't process the image.");
  context.drawImage(bitmap, sx, sy, edge, edge, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY),
  );
  if (!blob) throw new Error("Couldn't read that image.");
  return blob;
}

export function ProfileSettingsForm({
  userId,
  email,
  username,
  displayName,
  avatarUrl,
  initials,
  memberSince,
}: {
  userId: string;
  email: string;
  /** Null only when the profile row is missing, the same as everywhere else. */
  username: string | null;
  /** The stored value, which may be null. What the field edits. */
  displayName: string | null;
  avatarUrl: string | null;
  initials: string;
  memberSince: string;
}) {
  const router = useRouter();

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<
    "upload" | "remove" | "name" | "handle" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState(displayName ?? "");
  const [savedName, setSavedName] = useState(false);
  const nameChanged = draftName.trim() !== (displayName ?? "").trim();

  const [draftHandle, setDraftHandle] = useState(username ?? "");
  const [savedHandle, setSavedHandle] = useState(false);
  const handleChanged = draftHandle !== (username ?? "");

  async function handleFile(file: File) {
    setError(null);
    setBusy("upload");

    try {
      const blob = await toSquareJpeg(file);

      // A random name per upload, so the object URL changes when the picture
      // does — a fixed name would keep serving the old image from cache.
      const path = `${userId}/${crypto.randomUUID()}.jpg`;

      const supabase = createBrowserSupabase();
      const { error: uploadError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, { contentType: OUTPUT_TYPE });

      if (uploadError) throw new Error(uploadError.message);

      const result = await setAvatar(path);
      if (!result.ok) throw new Error(result.error);

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That upload didn't work.",
      );
    } finally {
      setBusy(null);
      // Clear the input so choosing the same file again still fires a change.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy("remove");
    const result = await removeAvatar();
    if (!result.ok) setError(result.error);
    else router.refresh();
    setBusy(null);
  }

  async function handleUsernameSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSavedHandle(false);
    setBusy("handle");

    const result = await updateUsername(draftHandle);
    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedHandle(true);
    router.refresh();
  }

  async function handleName(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSavedName(false);
    setBusy("name");

    const result = await updateDisplayName(draftName);
    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedName(true);
    router.refresh();
  }

  return (
    // Rows divided by rules rather than stacked cards: one panel per setting
    // was four boxes saying the same thing about themselves.
    <div className="divide-y divide-ink-line">
      <Row label="Picture">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            <Avatar url={avatarUrl} initials={initials} size={72} />
            {busy === "upload" && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/70">
                <span className="meta !text-xs !text-lamp">Saving…</span>
              </span>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="avatar-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="btn btn-quiet"
            >
              {avatarUrl ? "Change picture" : "Upload a picture"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={busy !== null}
                className="btn btn-quiet"
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </div>
      </Row>

      {/* The handle, which nobody chose at signup — it was derived from the
          email so the form could stay short and the Google path could work at
          all. This is where it gets chosen. */}
      <Row label="Username">
        <form onSubmit={handleUsernameSubmit}>
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {/* The "@" is drawn, not typed: it is how the handle is written
                  everywhere else, and it is not part of the stored value. */}
            <div className="relative w-full max-w-xs">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-bone-dim"
              >
                @
              </span>
              <input
                id="username"
                value={draftHandle}
                maxLength={USERNAME_MAX}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="username"
                onChange={(event) => {
                  setDraftHandle(normalizeUsername(event.target.value));
                  setSavedHandle(false);
                }}
                className="h-11 w-full rounded-md border border-ink-line bg-bone/8 pr-3 pl-7 text-bone placeholder:text-bone-dim focus:border-lamp focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy !== null || !handleChanged}
              className="btn btn-quiet"
            >
              {busy === "handle" ? "Saving…" : "Save"}
            </button>
            {savedHandle && !handleChanged && (
              <span role="status" className="meta !text-lamp">
                Saved
              </span>
            )}
          </div>
        </form>
      </Row>

      <Row label="Display name">
        <form onSubmit={handleName}>
          <label htmlFor="display-name" className="sr-only">
            Display name
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="display-name"
              value={draftName}
              maxLength={40}
              placeholder="Not set"
              onChange={(event) => {
                setDraftName(event.target.value);
                setSavedName(false);
              }}
              className="h-11 w-full max-w-xs rounded-md border border-ink-line bg-bone/8 px-3 text-bone placeholder:text-bone-dim focus:border-lamp focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy !== null || !nameChanged}
              className="btn btn-quiet"
            >
              {busy === "name" ? "Saving…" : "Save"}
            </button>
            {savedName && !nameChanged && (
              <span role="status" className="meta !text-lamp">
                Saved
              </span>
            )}
          </div>
        </form>
      </Row>

      {/* Account facts you can't edit here, kept at the bottom so the page
          still answers "which account is this?" without a second header. */}
      <Row label="Account">
        <p className="text-sm text-bone-soft">{email}</p>
        <p className="meta mt-1 !text-xs">Member since {memberSince}</p>
      </Row>

      {error && (
        <p role="alert" className="pt-4 text-sm leading-snug text-lamp">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled setting: name on the left from sm up, control on the right. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 py-6 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <h2 className="pt-2.5 text-sm font-medium text-bone-soft">{label}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
