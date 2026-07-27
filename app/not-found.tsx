import type { Metadata } from "next";
import Link from "next/link";

import { KinoAvatar } from "@/app/components/kino-avatar";

export const metadata: Metadata = {
  title: "Not found",
  description: "That page isn't in the catalog.",
};

/**
 * The 404.
 *
 * Deliberately not wrapped in AppShell: the shell reads the viewer, which means
 * cookies, which would make the one page every stray URL hits do a round trip
 * to Supabase before it can say "no". It stands on its own instead, with the
 * wordmark as the way back — the same lockup the header uses, so the page is
 * recognisably this site even without the bar.
 *
 * The backdrop is the sign-in room's: the two places you can end up without a
 * catalog behind you are the ones lit by the projector alone.
 */
export default function NotFound() {
  return (
    <main className="cinema-backdrop film-grain relative flex flex-1 flex-col">
      <div className="page-container flex flex-1 flex-col">
        <Link
          href="/"
          className="mt-6 flex w-fit items-center gap-2 rounded text-lg font-bold tracking-tight text-bone transition-colors hover:text-lamp"
        >
          <KinoAvatar size={32} />
          Kino
        </Link>

        <div className="flex flex-1 flex-col items-center justify-center gap-8 pb-24 text-center">
          <Filmstrip />

          <div className="flex max-w-md flex-col items-center gap-3">
            <h1 className="text-3xl font-bold text-bone sm:text-4xl">
              Oops, you&rsquo;re lost
            </h1>
            <p className="text-bone-soft">
              We couldn&rsquo;t find the page you were looking for. Head back to
              the Kino homepage below.
            </p>
          </div>

          <Link href="/" className="btn btn-primary">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * The signature: the code as three frames of print, with the middle one gone.
 *
 * Mono is the app's machine-data face and is otherwise reserved for the
 * consultation rail. A status code is machine output, so it earns the exception
 * here and nowhere else on the page.
 */
function Filmstrip() {
  return (
    <div
      aria-hidden
      className="w-fit rounded-sm border border-ink-line bg-ink-raised px-3 py-2"
    >
      <div className="filmstrip-perf" />

      <div className="my-2 flex gap-2">
        <Frame>4</Frame>
        {/* The missing frame. Lamp rather than bone, because it is the one
            thing on the page reporting a state rather than reading as type. */}
        <div className="h-24 w-20 rounded-xs border border-dashed border-lamp/40 bg-lamp/5 sm:h-28 sm:w-24" />
        <Frame>4</Frame>
      </div>

      <div className="filmstrip-perf" />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-24 w-20 place-items-center rounded-xs border border-ink-line bg-ink font-mono text-4xl text-bone sm:h-28 sm:w-24 sm:text-5xl">
      {children}
    </div>
  );
}
