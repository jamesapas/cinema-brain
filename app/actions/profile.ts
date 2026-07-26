"use server";

import { revalidatePath } from "next/cache";

import { AVATARS_BUCKET } from "@/lib/profiles/avatar";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Profile mutations.
 *
 * The avatar file itself is uploaded straight from the browser to Storage —
 * it never passes through the server, so a large image doesn't become a
 * Server Function payload. These actions own everything after that: recording
 * which object is current, and deleting the one it replaced.
 *
 * Like rate-movie.ts, these verify the caller rather than trusting the UI.
 * RLS is the real boundary; the check turns a silent no-op into a message.
 */

export type ProfileResult = { ok: true } | { ok: false; error: string };

const MAX_DISPLAY_NAME = 40;

export async function updateDisplayName(name: string): Promise<ProfileResult> {
  const trimmed = name.trim();
  if (trimmed.length > MAX_DISPLAY_NAME) {
    return { ok: false, error: `Keep it to ${MAX_DISPLAY_NAME} characters or fewer.` };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to edit your profile." };

  // Empty means "no name", which is null rather than an empty string — the
  // column's check constraint rejects blank names.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed || null })
    .eq("id", user.id);

  if (error) {
    console.error("[updateDisplayName]", error);
    return { ok: false, error: "Couldn't save that name. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Points the profile at a freshly uploaded object and removes the previous
 * one. Called after the browser upload succeeds.
 */
export async function setAvatar(path: string): Promise<ProfileResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to change your picture." };

  // The storage policy enforces this too, but a path outside the caller's own
  // folder is a bug worth naming rather than a row that fails a check
  // constraint further down.
  if (!path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "That upload doesn't belong to this account." };
  }

  const { data: previous } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", user.id);

  if (error) {
    console.error("[setAvatar]", error);
    return { ok: false, error: "Couldn't save that picture. Try again." };
  }

  // Best-effort: the new avatar is already live, so a failed cleanup leaves an
  // orphaned file rather than a broken profile. Don't fail the action for it.
  if (previous?.avatar_path && previous.avatar_path !== path) {
    const { error: removeError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove([previous.avatar_path]);
    if (removeError) console.error("[setAvatar] stale object", removeError);
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}

export async function removeAvatar(): Promise<ProfileResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to change your picture." };

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", user.id);

  if (error) {
    console.error("[removeAvatar]", error);
    return { ok: false, error: "Couldn't remove that picture. Try again." };
  }

  // Clear the row first, then the file: this order can orphan a file, the
  // other can leave the profile pointing at a 404.
  if (current?.avatar_path) {
    const { error: removeError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove([current.avatar_path]);
    if (removeError) console.error("[removeAvatar] object", removeError);
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}
