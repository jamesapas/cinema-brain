/**
 * Shown while the settings page is being built.
 *
 * Matches the two-column layout: the ProfileSidebar on the left and the
 * settings form on the right. The form skeleton mirrors the real sections:
 * avatar upload, display name, username, bio, and email fields.
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

        <div className="mt-5 space-y-2">
          <div className="skeleton h-9 w-full rounded-md" />
        </div>

        <div className="mt-4 flex gap-3">
          <div className="skeleton h-3.5 w-20 rounded" />
          <div className="skeleton h-3.5 w-20 rounded" />
        </div>

        <div className="mt-7 space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-4 w-36 rounded" />
          ))}
        </div>
      </aside>

      {/* Settings form */}
      <div className="mt-10 lg:mt-0">
        <div className="skeleton h-7 w-24 rounded" />

        <div className="mt-8 space-y-8">
          {/* Avatar upload section */}
          <div className="flex items-center gap-5">
            <div className="skeleton size-16 rounded-full" />
            <div className="skeleton h-9 w-32 rounded-md" />
          </div>

          {/* Text fields */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-10 w-full max-w-md rounded-md" />
            </div>
          ))}

          {/* Bio textarea */}
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-24 w-full max-w-md rounded-md" />
          </div>

          {/* Save button */}
          <div className="skeleton h-10 w-28 rounded-md" />
        </div>
      </div>
    </main>
  );
}
