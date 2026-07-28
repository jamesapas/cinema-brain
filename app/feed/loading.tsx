/**
 * Shown while the feed is being ranked and built.
 *
 * Matches the real page's two-column layout at lg+: the post column on the
 * left and the "Find people" aside on the right. Post cards are the most
 * visible element, so the skeleton keeps their shape — avatar, name, body
 * lines, and the optional film thumbnail slot — so the jump from loading to
 * loaded is as small as possible.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-14">
      {/* Feed column */}
      <div className="min-w-0 max-w-2xl">
        <header>
          <div className="skeleton h-8 w-16 rounded" />
          <div className="skeleton mt-1 h-3 w-64 rounded" />
        </header>

        {/* Composer placeholder */}
        <div className="mt-6 skeleton h-20 w-full rounded-xl" />

        {/* Post card skeletons */}
        <div className="mt-6 flex flex-col gap-5">
          {[...Array(5)].map((_, i) => (
            <article key={i} className="rounded-xl border border-ink-line p-5">
              {/* Author row */}
              <div className="flex items-center gap-3">
                <div className="skeleton size-9 shrink-0 rounded-full" />
                <div className="space-y-1.5">
                  <div className="skeleton h-3.5 w-28 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>

              {/* Body */}
              <div className="mt-4 space-y-2">
                <div className="skeleton h-3.5 w-full rounded" />
                <div className="skeleton h-3.5 w-5/6 rounded" />
                {i % 2 === 0 && <div className="skeleton h-3.5 w-2/3 rounded" />}
              </div>

              {/* Film card slot — only some posts have one */}
              {i % 3 !== 2 && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-line p-3">
                  <div className="skeleton aspect-[2/3] h-16 rounded" />
                  <div className="space-y-2">
                    <div className="skeleton h-3.5 w-32 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {/* Aside — Find people */}
      <aside className="mt-12 lg:sticky lg:top-28 lg:mt-0 lg:h-fit lg:self-start">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="mt-3 skeleton h-10 w-full rounded-md" />

        <div className="mt-8">
          <div className="skeleton h-3 w-16 rounded" />
          <ul className="mt-3 flex flex-col gap-4">
            {[...Array(4)].map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="skeleton size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-28 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
