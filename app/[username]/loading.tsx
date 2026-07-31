/**
 * Shown while a user's profile is being built.
 *
 * Matches the real page's two-column layout at lg+ and single-column below it.
 * The left rail mirrors ProfileSidebar: avatar circle, name, handle, bio lines,
 * and the stats column. The right column previews the rating chart, a Kino Take
 * block, and a grid of poster-sized cards so the shift from skeleton to page is
 * as small as possible.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
      {/* Left rail — mirrors ProfileSidebar */}
      <aside className="lg:sticky lg:top-28 lg:h-fit lg:self-start">
        {/* Mobile layout skeleton */}
        <div className="flex items-center gap-3.5 md:hidden">
          <div className="skeleton size-[52px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
        </div>

        {/* Desktop layout skeleton: Full-width avatar + name below */}
        <div className="hidden md:block">
          <div className="skeleton aspect-square w-full rounded-full" />
          <div className="mt-4 space-y-2">
            <div className="skeleton h-5 w-36 rounded" />
            <div className="skeleton h-3.5 w-24 rounded" />
          </div>
        </div>

        {/* Bio */}
        <div className="mt-3 space-y-2">
          <div className="skeleton h-3.5 w-full rounded" />
          <div className="skeleton h-3.5 w-3/4 rounded" />
        </div>

        {/* Action Button */}
        <div className="mt-5">
          <div className="skeleton h-9 w-full rounded-md" />
        </div>

        {/* Follow counts */}
        <div className="mt-4 flex items-center gap-2">
          <div className="skeleton h-3.5 w-24 rounded" />
          <div className="skeleton h-3.5 w-24 rounded" />
        </div>

        {/* Nav links */}
        <div className="mt-7 flex flex-col gap-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-4 w-32 rounded" />
          ))}
        </div>
      </aside>

      {/* Right column */}
      <div className="mt-10 flex flex-col gap-12 lg:mt-0">
        {/* Rating spread + Kino Take row */}
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Rating spread */}
          <section>
            <div className="skeleton h-6 w-36 rounded" />
            <div className="mt-6 flex items-center gap-8">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="skeleton h-12 w-10 rounded" />
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-3 w-16 rounded" />
              </div>
              <div className="flex w-full flex-col gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton h-3 w-5 rounded" />
                    <div className="skeleton h-2 flex-1 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Kino Take */}
          <section>
            <div className="skeleton h-6 w-28 rounded" />
            <div className="mt-4 space-y-2">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-11/12 rounded" />
              <div className="skeleton h-3 w-4/5 rounded" />
            </div>
          </section>
        </div>

        {/* Posts section */}
        <section>
          <div className="skeleton h-6 w-24 rounded" />
          <div className="mt-4 space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-4 w-48 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Rated films grid */}
        <section>
          <div className="skeleton h-6 w-40 rounded" />
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="skeleton aspect-[2/3] w-full rounded-md"
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
