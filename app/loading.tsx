/**
 * Shown while the home page (hero + catalog shelves) is building.
 *
 * Matches the real page's hero section height and three carousel rows so
 * nothing jumps when the real content streams in.
 */
export default function Loading() {
  return (
    <main className="flex-1 pb-24">
      {/* Hero placeholder — exact same height and layout as real Hero */}
      <section className="relative min-h-[62vh] w-full bg-gradient-to-t from-ink to-ink-raised sm:min-h-[70vh]">
        <div className="page-container relative flex min-h-[62vh] flex-col justify-end pt-24 pb-12 sm:min-h-[70vh] lg:pb-16">
          <div className="max-w-xl">
            {/* Title */}
            <div className="mt-2 skeleton h-10 w-72 max-w-full rounded sm:h-12 lg:h-14" />
            {/* Meta */}
            <div className="mt-3 skeleton h-4 w-40 rounded" />
            {/* Blurb */}
            <div className="mt-4 space-y-2 max-w-lg">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-4/5 rounded" />
            </div>
            {/* Actions + Star Rating */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-5">
              <div className="inline-grid grid-cols-2 gap-3">
                <div className="skeleton h-10 w-28 rounded-md" />
                <div className="skeleton h-10 w-28 rounded-md" />
              </div>
              <div className="skeleton h-6 w-32 rounded" />
            </div>
          </div>

          {/* Left-aligned active indicator lines */}
          <div className="mt-9 flex items-center gap-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`skeleton h-1 rounded-full ${i === 0 ? "w-8" : "w-4"}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Carousel shelves */}
      <div className="page-container flex flex-col gap-2 pt-6">
        {[...Array(3)].map((_, i) => (
          <section key={i} className="group/row">
            <div className="mb-3 flex items-baseline gap-3">
              <div className="skeleton h-5 w-36 rounded sm:h-6" />
            </div>
            <div className="flex gap-3 overflow-hidden pt-1 pb-4 sm:gap-4">
              {[...Array(8)].map((_, j) => (
                <div
                  key={j}
                  className="w-[8rem] shrink-0 sm:w-[12.5rem] lg:w-[14rem]"
                >
                  {/* Poster image aspect 2/3 */}
                  <div className="skeleton aspect-[2/3] w-full rounded-lg" />
                  {/* Title & meta placeholders matching real PosterCard flow */}
                  <div className="mt-2 space-y-1 sm:mt-2.5">
                    <div className="skeleton h-3.5 w-3/4 rounded sm:h-4" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                    <div className="mt-1.5 skeleton h-4 w-24 rounded sm:mt-2" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
