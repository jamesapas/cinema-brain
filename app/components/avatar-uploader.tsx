"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { removeAvatar, setAvatar } from "@/app/actions/profile";
import { Avatar } from "@/app/components/avatar";
import { AVATARS_BUCKET } from "@/lib/profiles/avatar";
import { createBrowserSupabase } from "@/lib/supabase/browser";

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

export function AvatarUploader({
  userId,
  url,
  initials,
}: {
  userId: string;
  url: string | null;
  initials: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (inputRef.current) inputRef.current.value = "";
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

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <Avatar url={url} initials={initials} size={96} />
        {busy === "upload" && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/70">
            <span className="meta !text-xs text-lamp">Saving…</span>
          </span>
        )}
      </div>

      <div className="flex flex-col items-start gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id="avatar-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="btn btn-quiet"
          >
            {url ? "Change picture" : "Upload a picture"}
          </button>

          {url && (
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

        <p className="meta !text-xs">JPEG, PNG, or WebP. Cropped square at 512px.</p>

        {error && (
          <p role="alert" className="text-sm leading-snug text-lamp">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
