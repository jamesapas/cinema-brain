"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { removeAvatar, setAvatar, updateDisplayName } from "@/app/actions/profile";
import { Avatar } from "@/app/components/avatar";
import { AVATARS_BUCKET } from "@/lib/profiles/avatar";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Who you are, at the top of your profile.
 *
 * At rest this is just a picture and a name — the page is for reading your own
 * history, not for administering an account, so the controls that change those
 * two things stay folded away behind one edit button until asked for.
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

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

export function ProfileIdentity({
  userId,
  email,
  username,
  name,
  displayName,
  avatarUrl,
  initials,
  memberSince,
}: {
  userId: string;
  email: string;
  /** Null only when the profile row is missing, the same as everywhere else. */
  username: string | null;
  /** What to greet them by — the display name, or the email's local part. */
  name: string;
  /** The stored value, which may be null. What the field edits. */
  displayName: string | null;
  avatarUrl: string | null;
  initials: string;
  memberSince: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | "name" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState(displayName ?? "");
  const [savedName, setSavedName] = useState(false);
  const nameChanged = draftName.trim() !== (displayName ?? "").trim();

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
      setError(cause instanceof Error ? cause.message : "That upload didn't work.");
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
    <section>
      <div className="flex items-center gap-5">
        <div className="relative">
          <Avatar url={avatarUrl} initials={initials} size={88} />
          {busy === "upload" && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/70">
              <span className="meta !text-xs !text-lamp">Saving…</span>
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <h1 className="truncate text-xl font-semibold text-bone sm:text-2xl">{name}</h1>
            <button
              type="button"
              onClick={() => {
                setEditing((current) => !current);
                setError(null);
                setSavedName(false);
              }}
              aria-expanded={editing}
              aria-label={editing ? "Close profile editor" : "Edit profile"}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors ${
                editing
                  ? "border-lamp bg-lamp/15 text-lamp"
                  : "border-ink-line text-bone-dim hover:border-bone/30 hover:text-bone"
              }`}
            >
              <PencilIcon />
            </button>
          </div>
          <p className="meta mt-1.5 truncate">
            {/* The handle first: it's the part of this line anyone would type. */}
            {username && <span className="text-bone-soft">@{username} · </span>}
            {email} · Member since {memberSince}
          </p>
        </div>
      </div>

      {editing && (
        <div className="mt-6 flex max-w-xl flex-col gap-5 rounded-lg border border-ink-line bg-ink-raised p-5">
          <div>
            <p className="label">Picture</p>
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              <span className="meta !text-xs">JPEG, PNG, or WebP. Cropped square.</span>
            </div>
          </div>

          <form onSubmit={handleName}>
            <label htmlFor="display-name" className="label">
              Display name
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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

          {error && (
            <p role="alert" className="text-sm leading-snug text-lamp">
              {error}
            </p>
          )}

          <div className="flex justify-end border-t border-ink-line pt-4">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-quiet"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
