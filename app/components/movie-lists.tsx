"use client";

import { Icon } from "@iconify/react";
import { createContext, useContext, useState, useTransition } from "react";

import { setListMembership } from "@/app/actions/movie-lists";
import { useSignIn, useSignedIn } from "@/app/components/session";
import type { ListMembership, MovieList } from "@/lib/movies/lists";

/**
 * Watchlist and favorites, as two buttons that appear wherever a film does.
 *
 * The membership lives in one context rather than being threaded down as props.
 * A poster is rendered by five different callers — shelves, search, the chat
 * panel, the profile grid, the film page — and every one of them would have had
 * to carry two sets of ids it has no other use for, purely so the last leaf
 * could colour an icon.
 *
 * The context is also what makes the optimistic state coherent: the same film
 * on a shelf and in the search overlay is one entry in one Set, so filling the
 * heart in one place fills it in both.
 */

type ListsValue = {
  has: (list: MovieList, movieId: number) => boolean;
  toggle: (list: MovieList, movieId: number) => void;
};

// Signed out, or outside the provider: nothing is on a list, and the buttons
// below intercept the click before they'd ever call toggle.
const ListsContext = createContext<ListsValue>({
  has: () => false,
  toggle: () => {},
});

export function MovieListsProvider({
  membership,
  children,
}: {
  membership: ListMembership;
  children: React.ReactNode;
}) {
  const [lists, setLists] = useState(() => ({
    watchlist: new Set(membership.watchlist),
    favorite: new Set(membership.favorite),
  }));
  // No busy state, for the same reason the stars have none: the icon has
  // already filled in, and dimming it would deny what you can see happened.
  const [, startTransition] = useTransition();

  function apply(list: MovieList, movieId: number, member: boolean) {
    setLists((current) => {
      const next = new Set(current[list]);
      if (member) next.add(movieId);
      else next.delete(movieId);
      return { ...current, [list]: next };
    });
  }

  const value: ListsValue = {
    has: (list, movieId) => lists[list].has(movieId),
    toggle: (list, movieId) => {
      const member = !lists[list].has(movieId);
      apply(list, movieId, member);
      startTransition(async () => {
        const result = await setListMembership(movieId, list, member);
        // Silent on success, and on failure the icon simply goes back to what
        // it was. There is nowhere on a poster corner to put an error string,
        // and the undone click says the same thing.
        if (!result.ok) apply(list, movieId, !member);
      });
    },
  };

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

const LIST_UI: Record<
  MovieList,
  { icon: string; iconOn: string; on: string; add: string; remove: string; signIn: string }
> = {
  watchlist: {
    icon: "lucide:bookmark",
    // Not bookmark-check: the tick is what's lost first once the glyph fills.
    iconOn: "lucide:bookmark",
    on: "text-lamp",
    add: "Add to watchlist",
    remove: "Remove from watchlist",
    signIn: "To save this to your watchlist",
  },
  favorite: {
    icon: "lucide:heart",
    iconOn: "lucide:heart",
    on: "text-ember",
    add: "Add to favorites",
    remove: "Remove from favorites",
    signIn: "To add this to your favorites",
  },
};

type Variant = "overlay" | "hero" | "inline";

/**
 * The pair of buttons.
 *
 * `overlay` sits in the corner of a poster: icons only, on a scrim dark enough
 * to survive whatever artwork is behind it. `hero` is the same pair laid across
 * instead of down, at the size of the controls it sits beside. `inline` is the
 * film page's own row, where there is room to say what the buttons do.
 *
 * Never hidden behind hover. The card's stars are always present on the same
 * principle — a control you have to go hunting for is one nobody uses — and a
 * hover-only button is unreachable on a phone besides.
 */
export function ListButtons({
  movieId,
  variant = "overlay",
}: {
  movieId: number;
  variant?: Variant;
}) {
  return (
    <div
      className={
        variant === "overlay" ? "flex flex-col gap-1.5" : "flex items-center gap-2"
      }
    >
      {(["watchlist", "favorite"] as const).map((list) => (
        <ListButton key={list} movieId={movieId} list={list} variant={variant} />
      ))}
    </div>
  );
}

function ListButton({
  movieId,
  list,
  variant,
}: {
  movieId: number;
  list: MovieList;
  variant: Variant;
}) {
  const { has, toggle } = useContext(ListsContext);
  const signedIn = useSignedIn();
  const signIn = useSignIn();

  const on = signedIn && has(list, movieId);
  const ui = LIST_UI[list];
  // Signed out the buttons still render — they show what an account is for —
  // and say so rather than promising a save that opens a sign-in panel.
  const label = !signedIn ? ui.signIn.replace(/^To /, "Sign in to ") : on ? ui.remove : ui.add;

  function click(event: React.MouseEvent) {
    // The poster's own link covers the whole tile and sits under these; on a
    // card, a click that reached it would navigate away mid-save.
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      signIn(ui.signIn);
      return;
    }
    toggle(list, movieId);
  }

  const icon = on ? ui.iconOn : ui.icon;

  if (variant !== "inline") {
    const hero = variant === "hero";
    return (
      <button
        type="button"
        onClick={click}
        aria-pressed={on}
        aria-label={label}
        title={label}
        // The scrim stays put in both states. Swapping it for a solid fill made
        // the poster corner flash a second, brighter shape at you; the glyph
        // filling in is the whole event, and the disc is only what keeps it
        // legible over the artwork underneath.
        className={`grid cursor-pointer place-items-center rounded-full bg-ink/65 backdrop-blur-sm transition-colors hover:bg-ink/85 ${
          hero ? "size-10" : "size-7 sm:size-8"
        } ${on ? ui.on : "text-bone hover:text-lamp"}`}
      >
        <Icon
          icon={icon}
          width={hero ? 19 : 15}
          height={hero ? 19 : 15}
          aria-hidden
          // Filled when set, outline when not: at this size the fill reads
          // before the shape does.
          //
          // pointer-events-none is load-bearing, not tidiness. Iconify swaps
          // the glyph for a new <svg> whenever this component re-renders, and
          // the hero re-renders on pointerdown to pause its carousel — so the
          // node the press landed on was gone by the time the button came back
          // up, and the browser fired no click at all. With the glyph inert,
          // the press and release both land on the button, which survives.
          className={`pointer-events-none ${on ? "[&_*]:fill-current" : ""}`}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      className="btn btn-quiet cursor-pointer"
    >
      <Icon
        icon={icon}
        width={17}
        height={17}
        aria-hidden
        className={`pointer-events-none ${on ? `${ui.on} [&_*]:fill-current` : ""}`}
      />
      {on ? (list === "watchlist" ? "On your watchlist" : "Favorited") : ui.add}
    </button>
  );
}
