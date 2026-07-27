import { AuthOverlayProvider } from "@/app/components/auth-overlay";
import { ChatOverlayProvider } from "@/app/components/chat-overlay";
import { MovieListsProvider } from "@/app/components/movie-lists";
import { SearchOverlayProvider } from "@/app/components/search-overlay";
import { SessionProvider } from "@/app/components/session";
import { SiteHeader } from "@/app/components/site-header";
import type { Viewer } from "@/lib/auth/viewer";
import { EMPTY_MEMBERSHIP, getListMembership } from "@/lib/movies/lists";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Everything a page shares: the header and the three panels that float over
 * it — search, Kino, and sign-in. Every page mounts it, so Cmd-K works
 * everywhere and anything on the page can ask for an account without
 * navigating.
 *
 * Auth is outermost of the three, because the other two summon it.
 *
 * `viewer` is nullable because the catalog is public — a signed-out visitor
 * gets the same shell, with a sign-in button where the account menu goes, and
 * the session context tells the gated controls inside which case they're in.
 *
 * Film details used to be a third provider here. They are a route now
 * (`/movie/[id]`), which is why a poster is a link and needs nothing from this
 * shell to open one.
 *
 * Watchlist and favorites are read here rather than by each page: the buttons
 * ride along on every poster, so the alternative was every page that renders a
 * film making the same query and passing the answer down. It's one indexed read
 * of a handful of ids, and only for someone signed in.
 */
export async function AppShell({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: React.ReactNode;
}) {
  const membership = viewer
    ? await getListMembership(await createServerSupabase())
    : EMPTY_MEMBERSHIP;

  return (
    <AuthOverlayProvider>
      <SessionProvider signedIn={viewer !== null}>
        <MovieListsProvider membership={membership}>
          <ChatOverlayProvider>
            <SearchOverlayProvider>
              <div className="flex min-h-full flex-1 flex-col">
                <SiteHeader
                  email={viewer?.email ?? null}
                  username={viewer?.username ?? null}
                  displayName={viewer?.displayName ?? null}
                  avatarUrl={viewer?.avatarUrl ?? null}
                  initials={viewer?.initials ?? null}
                />
                {children}
              </div>
            </SearchOverlayProvider>
          </ChatOverlayProvider>
        </MovieListsProvider>
      </SessionProvider>
    </AuthOverlayProvider>
  );
}
