/**
 * Shown while the feed route is loading.
 *
 * Matches the page's exact layout: composer pill, post card list, and 22rem right sidebar.
 * Header is omitted here so the site navigation stays intact without skeletonizing.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-24 sm:pt-28 pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-16 max-w-6xl">
      <div className="min-w-0 w-full">
        <header>
          <h1 className="text-2xl font-bold text-bone sm:text-3xl">Feed</h1>
        </header>

        <div className="mt-6">
          <div className="skeleton h-[50px] w-full rounded-full border border-ink-line" />
        </div>

        <div className="mt-6 divide-y divide-ink-line">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="py-5">
              <div className="flex gap-3.5">
                <div className="skeleton size-[44px] shrink-0 rounded-full" />

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="skeleton h-4 w-28 rounded-md" />
                      <div className="skeleton h-3 w-20 rounded-md" />
                      <div className="skeleton h-3 w-10 rounded-md" />
                    </div>
                    <div className="skeleton h-7 w-16 rounded-full" />
                  </div>

                  <div className="space-y-2 pt-0.5">
                    <div className="skeleton h-3.5 w-[92%] rounded-md" />
                    <div className="skeleton h-3.5 w-[65%] rounded-md" />
                  </div>

                  {i % 2 === 0 && (
                    <div className="pt-1">
                      <div className="skeleton h-40 w-28 rounded-lg" />
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-1">
                    <div className="skeleton h-6 w-14 rounded-full" />
                    <div className="skeleton h-6 w-24 rounded-full" />
                    <div className="skeleton h-6 w-16 rounded-full" />
                  </div>

                  <div className="pt-2 border-l-2 border-ink-line pl-3.5">
                    <div className="skeleton h-9 w-full rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="mt-10 lg:sticky lg:top-28 lg:mt-0 lg:h-fit lg:self-start w-full">
        <div>
          <div className="skeleton h-10 w-full rounded-full" />
        </div>
        <div className="mt-8 space-y-4">
          <div className="skeleton h-4 w-24 rounded-md" />
          <div className="space-y-4 pt-1">
            {[...Array(4)].map((_, i) => (
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
