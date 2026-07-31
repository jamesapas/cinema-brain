/**
 * Shown while a user's posts page is loading.
 *
 * Matches the profile's two-column layout: ProfileSidebar skeleton on the left
 * (mobile avatar circle + desktop full-width avatar + bio + action button + follow counts),
 * and realistic feed post skeletons on the right.
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

        {/* Joined date & stats */}
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="skeleton h-3.5 w-32 rounded" />
          <div className="skeleton h-3.5 w-28 rounded" />
          <div className="skeleton h-3.5 w-24 rounded" />
        </div>

        {/* Nav links */}
        <div className="mt-7 flex flex-col gap-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="skeleton h-4 w-32 rounded" />
          ))}
        </div>
      </aside>

      {/* Right column — header + post card skeletons */}
      <div className="mt-10 lg:mt-0">
        <div className="skeleton h-7 w-36 rounded border-b border-ink-line pb-4" />

        <div className="mt-6 space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border-b border-ink-line pb-6 pt-2">
              <div className="flex gap-3 sm:gap-4">
                <div className="skeleton size-9 sm:size-[44px] shrink-0 rounded-full" />

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="skeleton h-3.5 sm:h-4 w-24 sm:w-28 rounded-md" />
                        <div className="skeleton h-3 w-16 sm:w-20 rounded-md" />
                      </div>
                      <div className="skeleton h-3 w-14 sm:w-16 rounded-md" />
                    </div>
                    <div className="skeleton h-7 w-7 sm:w-8 shrink-0 rounded-full" />
                  </div>

                  <div className="space-y-2 pt-0.5">
                    <div className="skeleton h-3 sm:h-3.5 w-[92%] rounded-md" />
                    <div className="skeleton h-3 sm:h-3.5 w-[65%] rounded-md" />
                  </div>

                  {i % 2 === 0 && (
                    <div className="pt-1 flex gap-3 flex-nowrap">
                      <div className="space-y-1.5 w-20 sm:w-28 shrink-0">
                        <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                        <div className="skeleton h-3 w-14 sm:w-16 rounded-md" />
                      </div>
                      <div className="space-y-1.5 w-20 sm:w-28 shrink-0">
                        <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                        <div className="skeleton h-3 w-16 sm:w-20 rounded-md" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 sm:gap-4 pt-1">
                    <div className="skeleton h-6 w-12 sm:w-14 rounded-full" />
                    <div className="skeleton h-6 w-20 sm:w-24 rounded-full" />
                    <div className="skeleton h-6 w-14 sm:w-16 rounded-full" />
                  </div>

                  <div className="pt-2 border-l-2 border-ink-line pl-3.5 flex items-center gap-2.5">
                    <div className="skeleton size-6 sm:size-7 shrink-0 rounded-full" />
                    <div className="skeleton h-8 sm:h-9 min-w-0 flex-1 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
