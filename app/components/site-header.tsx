"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/app/components/avatar";
import { useSearchOverlay } from "@/app/components/search-overlay";
import { useSignIn } from "@/app/components/session";
import { createBrowserSupabase } from "@/lib/supabase/browser";

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
 * the last control: an account menu, or the one button that gets you one. The
 * catalog itself doesn't change, so neither should the bar over it.
 */
export function SiteHeader({
  email,
  displayName,
  avatarUrl,
  initials,
}: {
  /** All null for a signed-out visitor — see AppShell. */
  email: string | null;
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
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "bg-ink/95 backdrop-blur-md"
          : "bg-gradient-to-b from-ink via-ink/60 to-transparent"
      }`}
    >
      {/* The bar spans the viewport so its fill covers everything passing
          behind it; its contents stay in the page container. */}
      <div className="page-container flex items-center justify-between gap-4 py-4">
        <Link
          href="/"
          className="rounded text-lg font-bold tracking-tight text-bone transition-colors hover:text-lamp"
        >
          Cinema Brain
        </Link>

        <div className="flex items-center gap-1.5">
          <NavLink href="/" icon="lucide:house" label="Home" />

          <SearchButton />

          {email !== null ? (
            <AccountMenu
              email={email}
              displayName={displayName ?? email}
              avatarUrl={avatarUrl}
              initials={initials ?? "?"}
            />
          ) : (
            <SignInButton />
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
      <Icon icon="iconamoon:search" width={24} height={24} aria-hidden />
    </button>
  );
}

/**
 * The signed-out end of the bar.
 *
 * One button, not a "Sign in" / "Sign up" pair: the panel it opens offers
 * both, and two adjacent buttons reading as a choice you must make before you
 * know what either means is a worse door than one. It opens over the page
 * rather than replacing it, so nothing is lost by trying it.
 */
function SignInButton() {
  const signIn = useSignIn();

  return (
    <button
      type="button"
      onClick={() => signIn()}
      className="btn btn-primary ml-1 h-9 px-4 text-sm"
    >
      Sign in
    </button>
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
      <Icon icon={icon} width={24} height={24} aria-hidden />
    </Link>
  );
}

function AccountMenu({
  email,
  displayName,
  avatarUrl,
  initials,
}: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    // Home, not the login page: signing out drops you back into the catalog,
    // which is public now. Nothing to be thrown out of.
    router.replace("/");
    router.refresh();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-bone/10"
      >
        <Avatar url={avatarUrl} initials={initials} size={34} />
        <span className="sr-only">Account menu for {displayName}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-bone-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="m5 9 7 7 7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-60 overflow-hidden rounded-lg border border-ink-line bg-ink-raised shadow-2xl"
        >
          <div className="border-b border-ink-line px-4 py-3">
            <p className="truncate font-semibold text-bone">{displayName}</p>
            <p className="meta truncate">{email}</p>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-bone-soft transition-colors hover:bg-bone/8 hover:text-bone"
          >
            Your profile
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="block w-full px-4 py-2.5 text-left text-sm text-bone-soft transition-colors hover:bg-bone/8 hover:text-bone"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
