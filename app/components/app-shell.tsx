import { ChatOverlayProvider } from "@/app/components/chat-overlay";
import { SearchOverlayProvider } from "@/app/components/search-overlay";
import { SiteHeader } from "@/app/components/site-header";

/**
 * Everything a signed-in page shares: the header, the search overlay, and
 * Kino's chat window. Every page mounts it, so Cmd-K works everywhere.
 *
 * Film details used to be a third provider here. They are a route now
 * (`/movie/[id]`), which is why a poster is a link and needs nothing from this
 * shell to open one.
 */
export function AppShell({
  email,
  displayName,
  avatarUrl,
  initials,
  children,
}: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  children: React.ReactNode;
}) {
  return (
    <ChatOverlayProvider>
      <SearchOverlayProvider>
        <div className="flex min-h-full flex-1 flex-col">
          <SiteHeader
            email={email}
            displayName={displayName}
            avatarUrl={avatarUrl}
            initials={initials}
          />
          {children}
        </div>
      </SearchOverlayProvider>
    </ChatOverlayProvider>
  );
}
