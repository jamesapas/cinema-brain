/**
 * Shown while the feed route is loading.
 *
 * Matches the page's exact layout: mobile top search bar, composer pill, post card list, and 22rem right sidebar on desktop.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-24 sm:pt-28 pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-16 max-w-6xl">
      <div className="min-w-0 w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-bone sm:text-3xl">Feed</h1>
        </header>

        {/* Top search box on mobile */}
        <div className="lg:hidden">
          <div className="skeleton h-[42px] w-full rounded-xl" />
        </div>

        {/* Post composer */}
        <div>
          <div className="skeleton h-[52px] w-full rounded-full border border-ink-line" />
        </div>

        {/* Post list skeleton */}
        <div className="space-y-6">
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

      {/* Right sidebar on desktop */}
      <aside className="hidden lg:block lg:sticky lg:top-28 lg:mt-0 lg:h-fit lg:self-start w-full">
        <div>
          <div className="skeleton h-11 w-full rounded-lg" />
        </div>
        <div className="mt-8 space-y-4">
          <div className="skeleton h-4 w-24 rounded-md" />
          <div className="space-y-4 pt-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="skeleton size-9 shrink-0 rounded-full" />
                  <div className="space-y-1.5 min-w-0">
                    <div className="skeleton h-3.5 w-24 rounded-md" />
                    <div className="skeleton h-3 w-16 rounded-md" />
                  </div>
                </div>
                <div className="skeleton h-7 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
