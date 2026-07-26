import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Request-scoped client that acts as one signed-in user.
 *
 * Uses the publishable key plus the user's access token, so every query runs
 * under RLS — `user_movie_ratings` returns only that user's rows. The agent's
 * rating-history tool must use this, never the admin client, or one user's
 * ratings could leak into another user's recommendations.
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      // Pinned so this client always acts as this user, regardless of any auth
      // state another client in the process may write. See createAdminClient.
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "cinema-brain-user",
      },
    },
  );
}
