"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/app/components/avatar";
import { KinoLogo } from "@/app/components/kino-logo";
import { useSearchOverlay } from "@/app/components/search-overlay";
import { useSignIn } from "@/app/components/session";

/**
 * The bar over the catalog.
 *
 * Fixed, so the hero backdrop starts at the very top of the viewport and runs
 * underneath it — at rest the bar is only a gradient, and the artwork is
 * uninterrupted. It fills in once the page scrolls, because posters travelling
 * behind a transparent bar collide with the wordmark. No rule under it either
 * way; the fill alone does the separating.
 *
 * Everything to the right of the wordmark is the same signed in or out except
 * the last control: your avatar, or the buttons that get you one. The catalog
 * itself doesn't change, so neither should the bar over it.
 */
export function SiteHeader({
  email,
  username,
  displayName,
  avatarUrl,
  initials,
}: {
  /** All null for a signed-out visitor — see AppShell. */
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  initials: string | null;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); // A reload partway down the page starts scrolled.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${scrolled
          ? "bg-ink/95 backdrop-blur-md"
          : "bg-gradient-to-b from-ink via-ink/60 to-transparent"
        }`}
    >
      {/* The bar spans the viewport so its fill covers everything passing
          behind it; its contents stay in the page container. */}
      <div className="page-container flex items-center justify-between gap-4 py-4">
        {/* Face and name as one lockup: the brand and the thing you talk to
            are the same character, so the mark that opens the site is the same
            mark that answers you in the panel. */}
        <KinoLogo />

        <div className="flex items-center gap-1.5 sm:gap-2">
          <NavLink href="/" icon="lucide:home" label="Home" />

          {/* Public like the catalog, so it's here signed out too — the feed
              is something to read before it's something to write in. */}
          <NavLink href="/feed" icon="lucide:newspaper" label="Feed" />

          <SearchButton />

          {email !== null ? (
            <AccountLink
              username={username}
              displayName={displayName ?? email}
              avatarUrl={avatarUrl}
              initials={initials ?? "?"}
            />
          ) : (
            <AuthButtons />
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Opens the search overlay rather than navigating. Finding a film is usually a
 * detour, so it shouldn't cost you the page you were on.
 */
/** Standard icon size for all site header navigation controls. */
const NAV_ICON_SIZE = 22;

function SearchButton() {
  const openSearch = useSearchOverlay();

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search films"
      aria-keyshortcuts="Meta+K Control+K"
      className={ICON_CONTROL}
    >
      <Icon icon="lucide:search" width={NAV_ICON_SIZE} height={NAV_ICON_SIZE} aria-hidden />
    </button>
  );
}

/**
 * The signed-out end of the bar.
 *
 * Two doors, one of them painted: returning visitors look for "Log in" by
 * name, and new ones need to be told an account is theirs to make. Only "Sign
 * up" takes the gold, so the pair still reads as one recommended action rather
 * than a choice you must resolve before you know what either means. Both open
 * the panel over the page — on the form they name — so nothing is lost by
 * trying either.
 */
function AuthButtons() {
  const signIn = useSignIn();

  return (
    <>
      {/* Mobile single user icon button matching Home, Feed, Search spacing */}
      <button
        type="button"
        onClick={() => signIn()}
        aria-label="Sign in"
        className={`${ICON_CONTROL} sm:hidden`}
      >
        <Icon icon="lucide:user" width={NAV_ICON_SIZE} height={NAV_ICON_SIZE} aria-hidden />
      </button>

      {/* Desktop full buttons */}
      <div className="hidden items-center gap-2 sm:ml-1 sm:flex">
        <button
          type="button"
          onClick={() => signIn(undefined, "signin")}
          className="btn btn-quiet h-9 px-4 text-sm"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => signIn(undefined, "signup")}
          className="btn btn-primary h-9 px-4 text-sm"
        >
          Sign up
        </button>
      </div>
    </>
  );
}

/** Shared by the icon controls on the right, so they sit as one set. */
const ICON_CONTROL =
  "grid h-10 w-10 place-items-center rounded-full text-bone-soft transition-colors hover:bg-bone/10 hover:text-bone";

/**
 * A destination in the bar. The wordmark already goes home; this is the
 * signpost that says so, and it marks itself when you're there.
 *
 * Icon only, since it sits in a row of icon controls — the label would be the
 * one piece of text among them. The name is still announced.
 */
function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  const pathname = usePathname();
  const current = pathname === href;

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={`${ICON_CONTROL} ${current ? "!text-bone" : ""}`}
    >
      <Icon icon={icon} width={NAV_ICON_SIZE} height={NAV_ICON_SIZE} aria-hidden />
    </Link>
  );
}

/**
 * Your face in the bar, and nothing behind it.
 *
 * A menu of two items was a click in the way of the only place it went, and
 * the profile page now carries the account controls in its own sidebar — so
 * the avatar is simply the door to it, ringed when you're already through.
 */
function AccountLink({
  username,
  displayName,
  avatarUrl,
  initials,
}: {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
}) {
  const pathname = usePathname();
  const href = username ? `/${username}` : "/profile";
  const current = pathname === href;

  return (
    <Link
      href={href}
      aria-label={`Your profile, ${displayName}`}
      aria-current={current ? "page" : undefined}
      // The ring is always drawn and only changes colour, so nothing shifts
      // under the cursor; the lift is what the eye actually catches.
      className="grid size-10 place-items-center rounded-full ring-2 ring-transparent transition duration-200 hover:scale-105 hover:ring-lamp/70"
    >
      <Avatar url={avatarUrl} initials={initials} size={26} />
    </Link>
  );
}
