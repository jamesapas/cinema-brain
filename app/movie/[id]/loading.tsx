/**
 * Shown while a film's page is being built.
 *
 * The Next 16 docs recommend a `loading.tsx` on dynamic routes so the
 * navigation commits immediately instead of the browser sitting on the old
 * page. The catch here is that the header belongs to `AppShell`, which each
 * page mounts for itself — so it is gone for this beat, and the skeleton
 * reserves its height rather than letting the page jump when it returns.
 */
export default function Loading() {
  return (
    <main className="flex-1 pb-24">
      <div className="aspect-[16/9] max-h-[68vh] w-full animate-pulse bg-ink-raised sm:aspect-[2.6/1]" />

      <div className="page-container relative -mt-20 sm:-mt-28 lg:-mt-36">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <div className="aspect-[2/3] w-32 shrink-0 animate-pulse rounded-xl bg-ink-raised ring-1 ring-ink-line sm:w-44 lg:w-52" />

          <div className="min-w-0 flex-1 space-y-4 sm:pt-20 lg:pt-28">
            <div className="h-9 w-2/3 animate-pulse rounded bg-ink-raised sm:h-11" />
            <div className="h-4 w-48 animate-pulse rounded bg-ink-raised" />
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-ink-raised" />
              <div className="h-4 w-full max-w-xl animate-pulse rounded bg-ink-raised" />
              <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-ink-raised" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
