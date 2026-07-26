import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Browser client. Writes the auth cookies the server clients read, so signing in
 * here is what makes the session visible to Server Components and the chat route.
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
  );
}
