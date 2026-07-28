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
      {/* Hero section skeleton — exact same height, positioning, and structure as real MoviePage */}
      <section className="relative isolate min-h-[62vh] w-full overflow-hidden bg-gradient-to-t from-ink to-ink-raised sm:min-h-[70vh]">
        <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
          <div className="max-w-3xl">
            {/* Title */}
            <div className="skeleton h-9 w-3/4 rounded sm:h-10 lg:h-12" />

            {/* Meta (score · year · runtime · genres) */}
            <div className="mt-3 skeleton h-4 w-72 max-w-full rounded" />

            {/* Tagline */}
            <div className="mt-4 skeleton h-4 w-60 max-w-full rounded" />

            {/* Ask Kino button + XL Star Rating */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-5">
              <div className="skeleton h-10 w-28 rounded-md" />
              <div className="skeleton h-8 w-44 rounded" />
            </div>

            {/* List Buttons row (Watchlist / Favorites) */}
            <div className="mt-5 flex gap-2">
              <div className="skeleton h-8 w-28 rounded-md" />
              <div className="skeleton h-8 w-28 rounded-md" />
            </div>

            {/* Overview text lines */}
            <div className="mt-6 space-y-2 max-w-2xl">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-11/12 rounded" />
              <div className="skeleton h-4 w-3/4 rounded" />
            </div>
          </div>
        </div>
      </section>

      {/* Cast section skeleton */}
      <div className="page-container pt-12 sm:pt-14">
        <div className="mb-4 skeleton h-5 w-24 rounded sm:h-6" />
        <div className="no-scrollbar flex gap-3 overflow-hidden pt-1 pb-3">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="flex w-24 shrink-0 flex-col items-center sm:w-28"
            >
              <div className="skeleton size-16 rounded-full sm:size-20" />
              <div className="mt-2 skeleton h-3.5 w-16 rounded" />
              <div className="mt-1 skeleton h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* "More like this" shelf skeleton */}
      <div className="page-container pt-14 sm:pt-16">
        <section className="group/row">
          <div className="mb-3 flex items-baseline gap-3">
            <div className="skeleton h-5 w-36 rounded sm:h-6" />
          </div>
          <div className="flex gap-3 overflow-hidden pt-1 pb-4 sm:gap-4">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-[8rem] shrink-0 sm:w-[12.5rem] lg:w-[14rem]"
              >
                <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                <div className="mt-2 space-y-1 sm:mt-2.5">
                  <div className="skeleton h-3.5 w-3/4 rounded sm:h-4" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="mt-1.5 skeleton h-4 w-24 rounded sm:mt-2" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
