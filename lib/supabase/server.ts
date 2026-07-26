import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Cookie-backed client for Server Components, Server Functions, and Route
 * Handlers. Runs under RLS as the signed-in user.
 *
 * `cookies()` is async in this Next version, so this is async too.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Refresh happens in proxy.ts,
            // so ignoring this is correct rather than a swallowed failure.
          }
        },
      },
    },
  );
}
