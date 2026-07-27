"use server";

import { revalidatePath } from "next/cache";

import { getRatedMovies } from "@/lib/movies/catalog";
import {
  generateTasteSummary,
  summaryIsStale,
  tasteFingerprint,
} from "@/lib/profiles/taste-summary";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The one write that costs a model call.
 *
 * Only the owner can trigger it — a visitor reading someone's profile reads the
 * cached paragraph and nothing more, so a page that gets a lot of traffic costs
 * the same as a page that gets none. RLS says the same thing (a profile row is
 * writable by its own user), but the check here makes it a clear answer instead
 * of a silent no-op.
 *
 * Everything is re-derived server-side. The browser says "this looked stale"
 * and nothing else; if it was wrong, or if two tabs ask at once, the staleness
 * check runs again here and the second one returns the cached text for free.
 */

export type TasteSummaryResult =
  | { ok: true; summary: string | null }
  | { ok: false; error: string };

export async function refreshTasteSummary(): Promise<TasteSummaryResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to refresh your summary." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("taste_summary, taste_summary_key, taste_summary_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[refreshTasteSummary] profile", profileError);
    return { ok: false, error: "Couldn't read your profile." };
  }

  const rated = await getRatedMovies(supabase, user.id);

  // Someone else already regenerated it, or the ratings never moved. Either
  // way this is the answer, and it cost nothing.
  if (
    !summaryIsStale(
      rated,
      profile?.taste_summary_key ?? null,
      profile?.taste_summary_at ?? null,
    )
  ) {
    return { ok: true, summary: profile?.taste_summary ?? null };
  }

  let summary: string | null;
  try {
    summary = await generateTasteSummary(rated);
  } catch (error) {
    console.error("[refreshTasteSummary] generate", error);
    return { ok: false, error: "Kino couldn't get a read on this right now." };
  }

  // A model that returned nothing usable is not a reason to throw away the
  // paragraph already on the row, and not a reason to stamp the key either —
  // leaving it stale means the next visit tries again.
  if (!summary) return { ok: true, summary: profile?.taste_summary ?? null };

  const { error: writeError } = await supabase
    .from("profiles")
    .update({
      taste_summary: summary,
      taste_summary_key: tasteFingerprint(rated),
      taste_summary_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (writeError) {
    // The paragraph is good even if caching it failed; showing it beats
    // discarding a call we already paid for.
    console.error("[refreshTasteSummary] write", writeError);
    return { ok: true, summary };
  }

  revalidatePath("/[username]", "page");
  return { ok: true, summary };
}
