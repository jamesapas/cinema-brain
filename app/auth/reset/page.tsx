import type { Metadata } from "next";

import { KinoLogo } from "@/app/components/kino-logo";

import { ResetGate } from "./reset-gate";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Kino account.",
};

/**
 * The far end of the reset link.
 *
 * The one auth screen that is a page rather than a panel. Everywhere else auth
 * opens over what you were looking at, because you reached for it *because* of
 * something on the page — but arriving from an inbox there is no page
 * underneath to preserve. So it stands on its own, on the 404's backdrop: the
 * places you can end up without a catalog behind you are the ones lit by the
 * projector alone.
 *
 * The page itself decides nothing about the link. Supabase's default mail
 * template returns the session in a URL fragment, which no server ever
 * receives, so judging it here would mean calling every such arrival dead —
 * see ResetGate, which reads what only the browser can.
 *
 * What's left is the frame: the wordmark, the backdrop, and the card the gate
 * renders into.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <main className="cinema-backdrop film-grain relative flex flex-1 flex-col">
      <div className="page-container flex flex-1 flex-col">
        {/* The header's lockup exactly — same mark, same size, same optical
            nudge under the wordmark — so arriving here from an inbox still
            reads as this site. Only the hover is added: here it is the one way
            back, where in the bar it sits beside a Home button. */}
        <KinoLogo className="mt-6 w-fit" />

        <div className="flex flex-1 items-center justify-center px-4 pb-24">
          <div className="overlay-card sheet-in w-full max-w-[27rem] px-5 py-6 sm:px-7">
            <ResetGate expired={Boolean(expired)} />
          </div>
        </div>
      </div>
    </main>
  );
}

