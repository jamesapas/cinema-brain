"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/app/components/avatar";
import { avatarUrl, displayNameFor, initialsFor } from "@/lib/profiles/avatar";
import { MIN_SEARCH_LENGTH, type ProfileResult } from "@/lib/profiles/search";

/**
 * The people box.
 *
 * A second search, and the reason it is a box on a page rather than another
 * icon in the header: the header's magnifier and Cmd-K are the film search,
 * they have been since before there were profiles, and quietly teaching them to
 * sometimes return people would make you check what mode you were in before
 * typing. This one sits where you'd go looking for someone — beside the feed —
 * and says what it finds.
 *
 * Results drop under the field rather than replacing the page, because finding
 * a person is the same kind of detour finding a film is: you look, you go, or
 * you close it and carry on reading.
 */

type PeopleResponse = { people?: ProfileResult[]; hasMore?: boolean; error?: string };

export function PeopleSearch() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim();
  const searched = term.length >= MIN_SEARCH_LENGTH;

  /**
   * Clearing back below the minimum happens here rather than in the fetch
   * effect, exactly as it does in the film overlay: it is a direct consequence
   * of the keystroke, and setting state synchronously inside an effect just to
   * undo it causes a cascading render.
   */
  function updateQuery(next: string) {
    setQuery(next);
    setOpen(true);

    if (next.trim().length < MIN_SEARCH_LENGTH) {
      setPeople([]);
      setError(null);
      setLoading(false);
    }
  }

  // Debounced, and aborted on the next keystroke — the abort matters more than
  // the debounce, since a slow answer for "ja" landing after "james" would
  // repaint rows for a term nobody is looking at any more.
  useEffect(() => {
    if (term.length < MIN_SEARCH_LENGTH) return;

    const controller = new AbortController();

    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/people?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as PeopleResponse;
        if (!response.ok) throw new Error(payload.error ?? "Search failed.");

        setPeople(payload.people ?? []);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
        setPeople([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [term]);

  // A click anywhere else puts the panel away. Pointerdown rather than click so
  // it closes on the press, before whatever was pressed has done its own work.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Icon
          icon="lucide:user-search"
          width={18}
          height={18}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-bone-dim"
        />

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Find people"
          aria-label="Search people by name or handle"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-ink-line bg-bone/8 pr-3 pl-11 text-sm text-bone transition-colors placeholder:text-bone-dim focus:border-lamp focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {open && searched && (
        <div className="overlay-card result-in absolute inset-x-0 top-full z-30 mt-2 max-h-[22rem] overflow-y-auto">
          {error ? (
            <p role="alert" className="px-4 py-5 text-sm text-lamp">
              {error}
            </p>
          ) : people.length === 0 ? (
            <p className="meta px-4 py-5">
              {loading ? "Searching…" : `Nobody here matches “${term}”.`}
            </p>
          ) : (
            <ul className="py-1.5">
              {people.map((person) => (
                <li key={person.id}>
                  <PersonRow person={person} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One person in the drop-down. A real link, so middle-click and "open in new
 * tab" work the way they do on the film results.
 */
function PersonRow({
  person,
  onNavigate,
}: {
  person: ProfileResult;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/${person.username}`}
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-bone/10"
    >
      <Avatar
        url={avatarUrl(person.avatar_path)}
        initials={initialsFor(person.display_name, person.username)}
        size={36}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-bone">
          {displayNameFor(person.display_name, person.username)}
        </span>
        <span className="meta block truncate !text-xs">@{person.username}</span>
      </span>
    </Link>
  );
}
