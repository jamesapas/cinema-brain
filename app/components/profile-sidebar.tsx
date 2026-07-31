"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Avatar } from "@/app/components/avatar";
import { FollowButton } from "@/app/components/follow-button";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * The rail down the left of your profile.
 *
 * No card around it: the rail is navigation, and boxing it makes a second
 * panel competing with the content it points at. It's typography and one
 * accent bar instead — the active line is marked, everything else recedes.
 *
 * Who you are sits at the top, so the pages themselves don't have to repeat
 * your face. The way out is at the bottom, far from anything you click twice.
 *
 * `soon` on RailItem is left in place: it's how a shelf gets drawn before it
 * exists, which is what Watchlist and Favorites were until they did.
 */
export function ProfileSidebar({
  displayName,
  username,
  avatarUrl,
  initials,
  bio,
  followers,
  following,
  isOwner = true,
  profileId,
  viewerFollows = false,
  joinedDate,
  statsCount = 0,
  statsAverage = "0.0",
}: {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
  bio: string | null;
  followers: number;
  following: number;
  isOwner?: boolean;
  profileId?: string;
  viewerFollows?: boolean;
  joinedDate?: string;
  statsCount?: number;
  statsAverage?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const overviewHref = username ? `/${username}` : "/profile";

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    // Home, not the login page: signing out drops you back into the catalog,
    // which is public now. Nothing to be thrown out of.
    router.replace("/");
    router.refresh();
  }

  return (
    // Sticky under the fixed bar, so the rail stays with you down a long list
    // of rated films. Self-start keeps it from stretching to the column's full
    // height and stranding Sign out at the bottom of the page.
    <aside className="lg:sticky lg:top-28 lg:h-fit lg:self-start">
      {/* Mobile layout: small avatar + name side-by-side */}
      <Link href={overviewHref} className="flex items-center gap-3.5 md:hidden">
        <Avatar url={avatarUrl} initials={initials} size={52} />
        <div className="min-w-0">
          <div className="truncate font-semibold text-bone">
            {displayName}
          </div>
          {username && <p className="meta truncate !text-xs">@{username}</p>}
        </div>
      </Link>

      {/* Desktop layout: GitHub-style full width avatar with name below */}
      <div className="hidden md:block">
        <Link href={overviewHref} className="block w-full aspect-square">
          <Avatar url={avatarUrl} initials={initials} size={296} className="w-full h-full text-4xl" />
        </Link>
        <div className="mt-4">
          <h1 className="text-xl font-bold text-bone leading-tight">
            {displayName}
          </h1>
          {username && (
            <p className="text-sm text-bone-soft font-normal mt-0.5">@{username}</p>
          )}
        </div>
      </div>

      {bio && <p className="mt-3 text-sm leading-relaxed text-bone-soft">{bio}</p>}

      {isOwner ? (
        <Link href="/profile/settings" className="btn btn-quiet mt-5 w-full">
          Edit profile
        </Link>
      ) : profileId && username ? (
        <div className="mt-5 w-full">
          <FollowButton
            targetId={profileId}
            targetUsername={username}
            initialFollowing={viewerFollows}
          />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Icon icon="mdi:account-multiple-outline" className="size-4 text-bone/70" />

        <Link href={username ? `/${username}/followers` : "#"} className="meta follow-count-link">
          <strong className="font-semibold text-bone">{followers}</strong> followers
        </Link>

        <span className="text-bone/40">•</span>

        <Link href={username ? `/${username}/following` : "#"} className="meta follow-count-link">
          <strong className="font-semibold text-bone">{following}</strong> following
        </Link>
      </div>

      {!isOwner && (joinedDate || statsCount > 0) && (
        <div className="mt-4 flex flex-col gap-2">
          {joinedDate && (
            <div className="flex items-center gap-2">
              <Icon icon="lucide:calendar" className="size-4 text-bone/70" />
              <span className="meta">Joined {joinedDate}</span>
            </div>
          )}

          {statsCount > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Icon icon="lucide:clapperboard" className="size-4 text-bone/70" />
                <span className="meta">
                  <strong className="font-semibold text-bone">{statsCount}</strong> films rated
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Icon icon="lucide:star" className="size-4 text-bone/70" />
                <span className="meta">
                  <strong className="font-semibold text-bone">{statsAverage}</strong> average rating
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {isOwner && (
        <nav aria-label="Profile sections" className="mt-7 flex flex-col gap-0.5">
          <RailItem
            href="/profile/watchlist"
            icon="lucide:bookmark"
            label="Watchlist"
            current={pathname === "/profile/watchlist"}
          />
          <RailItem
            href="/profile/favorites"
            icon="lucide:heart"
            label="Favorites"
            current={pathname === "/profile/favorites"}
          />
          <button
            type="button"
            onClick={signOut}
            className={`${RAIL_ITEM} mt-2.5 border-t border-ink-line pt-5 text-bone-soft hover:text-bone`}
          >
            <Icon icon="lucide:log-out" width={18} height={18} aria-hidden />
            Sign out
          </button>
        </nav>
      )}
    </aside>
  );
}

/** One line in the rail. The bar on the left is the only marker of place. */
const RAIL_ITEM =
  "flex w-full items-center gap-3 py-2.5 text-left text-sm transition-colors";

function RailItem({
  href,
  icon,
  label,
  current = false,
  soon = false,
}: {
  href?: string;
  icon: string;
  label: string;
  current?: boolean;
  soon?: boolean;
}) {
  const body = (
    <>
      <Icon icon={icon} width={18} height={18} aria-hidden />
      <span className="flex-1">{label}</span>
      {soon && (
        <span className="text-[0.625rem] tracking-wide text-bone-dim/70 uppercase">
          Soon
        </span>
      )}
    </>
  );

  // The unbuilt shelves are disabled buttons rather than links: they read as
  // coming rather than broken.
  if (!href) {
    return (
      <button type="button" disabled className={`${RAIL_ITEM} text-bone-dim/60`}>
        {body}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`${RAIL_ITEM} ${
        current ? "font-semibold text-bone" : "text-bone-soft hover:text-bone"
      }`}
    >
      {body}
    </Link>
  );
}
