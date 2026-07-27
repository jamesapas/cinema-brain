import { AuthOverlayProvider } from "@/app/components/auth-overlay";
import { ChatOverlayProvider } from "@/app/components/chat-overlay";
import { SearchOverlayProvider } from "@/app/components/search-overlay";
import { SessionProvider } from "@/app/components/session";
import { SiteHeader } from "@/app/components/site-header";
import type { Viewer } from "@/lib/auth/viewer";

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
 */
export function AppShell({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: React.ReactNode;
}) {
  return (
    <AuthOverlayProvider>
      <SessionProvider signedIn={viewer !== null}>
        <ChatOverlayProvider>
          <SearchOverlayProvider>
            <div className="flex min-h-full flex-1 flex-col">
              <SiteHeader
                email={viewer?.email ?? null}
                displayName={viewer?.displayName ?? null}
                avatarUrl={viewer?.avatarUrl ?? null}
                initials={viewer?.initials ?? null}
              />
              {children}
            </div>
          </SearchOverlayProvider>
        </ChatOverlayProvider>
      </SessionProvider>
    </AuthOverlayProvider>
  );
}
