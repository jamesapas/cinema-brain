/**
 * Shown while a film's page is being built.
 *
 * The Next 16 docs recommend a `loading.tsx` on dynamic routes so the
 * navigation commits immediately instead of the browser sitting on the old
 * page. The catch here is that the header belongs to `AppShell`, which each
 * page mounts for itself — so it is gone for this beat, and the skeleton
 * reserves its height rather than letting the page jump when it returns.
 *
 * Every block below is sized from the real page measured in a browser at
 * 1440×900, and carries the same margin utilities as the element it stands in
 * for, so the two line up rather than approximately agreeing:
 *
 *   title 50px · meta 20 · tagline 21 · Ask Kino 129×40 · stars 256×32
 *   overview 3 lines
 *
 * The genre pills that used to close this column are gone: the genres moved up
 * into the meta line, which is why that bar is now the width of a whole
 * sentence rather than of "2026 · 1h 36m".
 *
 * Colour comes from `.skeleton` in globals.css — ink-blue, breathing — so this
 * beat belongs to the same app as the page that replaces it.
 */
export default function Loading() {
  return (
    <main className="flex-1 pb-24">
      {/* The same box the artwork fills, so nothing jumps when it arrives. The
          gradient stands in for the real hero's bottom one: ink at the foot of
          the section, so there is no seam against the page below it either
          before or after the film lands. */}
      <section className="relative min-h-[62vh] w-full bg-gradient-to-t from-ink to-ink-raised sm:min-h-[70vh]">
        <div className="page-container flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
          <div className="max-w-3xl">
            {/* Title. Narrower than the real one on purpose — a title is a few
                words, not a full measure — but the same height. */}
            <div className="skeleton h-10 w-2/3 max-w-lg rounded sm:h-[50px]" />

            {/* Score · year · runtime · three genres, on one line. */}
            <div className="skeleton mt-3 h-5 w-[21rem] max-w-full rounded" />

            {/* Tagline. */}
            <div className="skeleton mt-4 h-5 w-72 max-w-full rounded" />

            {/* The rating row: Ask Kino first, then the stars and their score,
                in that order and at those widths. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-5">
              <div className="skeleton h-10 w-32 rounded-md" />
              <div className="skeleton h-8 w-64 max-w-full rounded" />
            </div>

            {/* Overview, three lines. 18px bars on a 12px rhythm come to the
                78px three lines of `leading-relaxed` actually occupy — this
                block is the tallest thing here, and the column is anchored to
                its bottom, so getting it wrong pushed everything above it down
                by the difference. */}
            <div className="mt-6 space-y-3">
              <div className="skeleton h-[18px] w-full rounded" />
              <div className="skeleton h-[18px] w-11/12 rounded" />
              <div className="skeleton h-[18px] w-2/3 rounded" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
