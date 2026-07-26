"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/app/components/avatar";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/**
 * The bar over the catalog.
 *
 * Fixed, so the hero backdrop starts at the very top of the viewport and runs
 * underneath it — at rest the bar is only a gradient, and the artwork is
 * uninterrupted. It fills in once the page scrolls, because posters travelling
 * behind a transparent bar collide with the wordmark. No rule under it either
 * way; the fill alone does the separating.
 */
export function SiteHeader({
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

        <AccountMenu
          email={email}
          displayName={displayName}
          avatarUrl={avatarUrl}
          initials={initials}
        />
      </div>
    </header>
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
    router.replace("/login");
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
