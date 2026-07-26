import { ChatOverlayProvider } from "@/app/components/chat-overlay";
import { MovieDetailsProvider } from "@/app/components/movie-details";
import { SearchOverlayProvider } from "@/app/components/search-overlay";
import { SiteHeader } from "@/app/components/site-header";

/**
 * Everything a signed-in page shares: the header, the details dialog, the
 * search overlay, and the chat drawer. Every page mounts it, so a poster opens
 * the same dialog wherever you clicked it and Cmd-K works everywhere.
 *
 * Nesting is load-bearing: the search overlay opens the details dialog, so it
 * sits inside that provider.
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
      <MovieDetailsProvider>
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
      </MovieDetailsProvider>
    </ChatOverlayProvider>
  );
}
