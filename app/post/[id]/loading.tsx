export default function Loading() {
  return (
    <main className="page-container flex-1 pt-24 sm:pt-28 pb-24 max-w-6xl">
      <div className="w-full lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12 xl:gap-16">
        {/* Left main post content skeleton */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="skeleton h-4 w-32 rounded-md mb-6" />

          <div className="mt-4 pb-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="skeleton size-[52px] rounded-full shrink-0" />
                <div className="space-y-2">
                  <div className="skeleton h-4 w-36 rounded-md" />
                  <div className="skeleton h-3 w-24 rounded-md" />
                </div>
              </div>
              <div className="skeleton h-8 w-20 rounded-full shrink-0" />
            </div>

            <div className="space-y-3 pt-2">
              <div className="skeleton h-4 w-full rounded-md" />
              <div className="skeleton h-4 w-[90%] rounded-md" />
              <div className="skeleton h-4 w-[65%] rounded-md" />
            </div>

            <div className="pt-6 border-t border-ink-line flex items-center gap-4">
              <div className="skeleton h-7 w-16 rounded-full" />
              <div className="skeleton h-7 w-20 rounded-full" />
              <div className="skeleton h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>

        {/* Right sidebar comments skeleton */}
        <div className="mt-8 lg:mt-0 w-full space-y-4">
          <div className="flex items-center justify-between border-b border-ink-line pb-3">
            <div className="skeleton h-5 w-24 rounded-md" />
          </div>
          <div className="skeleton h-10 w-full rounded-lg" />
          <div className="space-y-3 pt-2">
            <div className="flex gap-3">
              <div className="skeleton size-7 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="skeleton h-3.5 w-24 rounded-md" />
                <div className="skeleton h-3 w-full rounded-md" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <div className="skeleton size-7 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="skeleton h-3.5 w-28 rounded-md" />
                <div className="skeleton h-3 w-3/4 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
