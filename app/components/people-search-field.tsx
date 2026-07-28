"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The people box on /people, where the URL owns the results.
 *
 * The rail's version (`people-search.tsx`) drops its answers under the field
 * and leaves the page alone, because looking someone up from the feed is a
 * detour. This one is the page, so the term belongs in `?q=` where a result set
 * can be linked and reloaded — the same split `search-field.tsx` and the film
 * overlay already make.
 *
 * Typing replaces the history entry rather than pushing, so back leaves the
 * page instead of walking letter by letter through what you typed.
 */
export function PeopleSearchField({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const next = value.trim();
      if (next === initialQuery) return;
      router.replace(next ? `/people?q=${encodeURIComponent(next)}` : "/people");
    }, 250);

    return () => clearTimeout(id);
  }, [value, initialQuery, router]);

  return (
    <div className="relative">
      <Icon
        icon="lucide:user-search"
        width={22}
        height={22}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-bone-dim"
      />

      <input
        ref={inputRef}
        type="search"
        // Arriving at /people means you came to type.
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by name or handle…"
        aria-label="Search people by name or handle"
        className="h-14 w-full rounded-lg border border-ink-line bg-bone/8 pr-12 pl-13 text-lg text-bone transition-colors placeholder:text-bone-dim focus:border-lamp focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-bone-dim transition-colors hover:bg-bone/10 hover:text-bone"
        >
          <Icon icon="lucide:x" width={18} height={18} aria-hidden />
        </button>
      )}
    </div>
  );
}
