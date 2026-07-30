export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24">
      <div className="max-w-2xl">
        <div className="skeleton h-8 w-32 rounded-md" />
        <div className="mt-5">
          <div className="skeleton h-11 w-full rounded-lg" />
        </div>
      </div>

      <div className="mt-10 max-w-2xl space-y-4">
        <div className="skeleton h-4 w-48 rounded-md" />
        <div className="space-y-3 pt-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3 border-b border-ink-line">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="skeleton size-9 shrink-0 rounded-full" />
                <div className="space-y-1.5 min-w-0">
                  <div className="skeleton h-4 w-32 rounded-md" />
                  <div className="skeleton h-3 w-20 rounded-md" />
                </div>
              </div>
              <div className="skeleton h-7 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
