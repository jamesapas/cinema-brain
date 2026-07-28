/**
 * Shared skeleton for the followers and following lists.
 *
 * Matches the two-column layout: sidebar on the left with avatar + name + stats,
 * and a list of person rows on the right. Each row has an avatar circle,
 * a name bar, and a handle bar — mirroring what FollowListRow renders.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-14">
      {/* Left rail */}
      <aside className="lg:sticky lg:top-28 lg:h-fit lg:self-start">
        <div className="flex items-center gap-3.5">
          <div className="skeleton size-[52px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
        </div>
        <div className="mt-5 skeleton h-9 w-full rounded-md" />
        <div className="mt-4 flex gap-3">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="mt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-3 w-32 rounded" />
          ))}
        </div>
      </aside>

      {/* Follow list */}
      <div className="mt-10 lg:mt-0">
        <div className="skeleton h-7 w-28 rounded border-b border-ink-line pb-4" />
        <ul className="mt-2 flex flex-col divide-y divide-ink-line">
          {[...Array(8)].map((_, i) => (
            <li key={i} className="flex items-center gap-3 py-4">
              <div className="skeleton size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
              <div className="skeleton h-8 w-20 rounded-md" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
