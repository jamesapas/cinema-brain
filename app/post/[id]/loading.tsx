export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24">
      <div className="max-w-2xl space-y-4">
        {/* Back link skeleton */}
        <div className="skeleton h-4 w-32 rounded-md" />

        {/* Post card skeleton */}
        <div className="mt-4 rounded-xl border border-ink-line p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="skeleton size-10 rounded-full" />
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-28 rounded-md" />
              <div className="skeleton h-3 w-16 rounded-md" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <div className="skeleton h-4 w-full rounded-md" />
            <div className="skeleton h-4 w-3/4 rounded-md" />
          </div>
          <div className="pt-3 border-t border-ink-line space-y-3">
            <div className="skeleton h-8 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </main>
  );
}
