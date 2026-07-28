/**
 * Shown while the favorites page is being built.
 *
 * Matches the two-column layout: ProfileSidebar on the left and a poster grid
 * on the right. The grid uses the same `auto-fill` column config as the real
 * page, so the skeleton cards land on exactly the same grid lines.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
      {/* Left rail — mirrors ProfileSidebar */}
      <aside className="lg:sticky lg:top-28 lg:h-fit lg:self-start">
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton size-20 rounded-full" />
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="mt-5 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-4 w-36 rounded" />
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
      </aside>

      {/* Poster grid */}
      <div className="mt-10 lg:mt-0">
        <div className="skeleton h-7 w-24 rounded" />
        <div className="skeleton mt-1 h-3 w-40 rounded" />

        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] w-full rounded-md" />
          ))}
        </div>
      </div>
    </main>
  );
}
