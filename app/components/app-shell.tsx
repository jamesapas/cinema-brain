import { ChatDrawerProvider } from "@/app/components/chat-drawer";
import { MovieDetailsProvider } from "@/app/components/movie-details";
import { SiteHeader } from "@/app/components/site-header";

/**
 * Everything a signed-in page shares: the header, the details dialog, and the
 * chat drawer. Both the catalog and the profile mount it, so a poster opens
 * the same dialog wherever you clicked it.
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
    <ChatDrawerProvider>
      <MovieDetailsProvider>
        <div className="flex min-h-full flex-1 flex-col">
          <SiteHeader
            email={email}
            displayName={displayName}
            avatarUrl={avatarUrl}
            initials={initials}
          />
          {children}
        </div>
      </MovieDetailsProvider>
    </ChatDrawerProvider>
  );
}
