import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely, so it must only ever be used from
 * trusted server code — the TMDB sync, the embedding job, and other back-office
 * tasks. Never import this from a component that can reach the client bundle;
 * use the request-scoped anon client for anything acting on a user's behalf.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const secretKey = serverEnv.supabaseSecretKey;

  return createClient<Database>(publicEnv.supabaseUrl, secretKey, {
    auth: {
      // No user session to persist or refresh in a batch job.
      persistSession: false,
      autoRefreshToken: false,
      // Clients for the same project otherwise share one auth-storage slot, so a
      // user sign-in elsewhere in this process would overwrite this client's
      // Authorization header with that user's token — silently downgrading admin
      // calls to that user's privileges.
      storageKey: "cinema-brain-admin",
    },
  });
}
