import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every matched request.
 *
 * Refreshing is now all it does. Browsing is public, and what isn't is refused
 * where it happens rather than at the edge: RLS on the personal tables, an
 * auth check inside every Server Function, and a 401 from /api/chat. There is
 * no sign-in route left to redirect anyone to or away from — auth is a panel
 * over the page you're already on.
 *
 * This is `proxy.ts`, not `middleware.ts` — the middleware file convention is
 * deprecated in this Next version and renamed to proxy. Kept self-contained
 * because proxy code is meant to run independently of the render path.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser (not getSession) so an expired token is actually refreshed here,
  // where cookies can still be written. The call is the whole point of this
  // function — the result isn't read, the refreshed cookies on `response` are.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Without a matcher this runs on static assets too, which would block CSS/JS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
