/**
 * Shown while the search page is loading.
 *
 * The search input is the first thing on the page, so it appears above the
 * skeleton grid — the user can see where to type while results are loading.
 * The poster grid uses the same flex + gap as the real results grid.
 */
export default function Loading() {
  return (
    <main className="page-container flex-1 pt-28 pb-24">
      <div className="max-w-2xl">
        <div className="skeleton h-8 w-20 rounded" />
        {/* Search input placeholder */}
        <div className="mt-5 skeleton h-11 w-full rounded-lg" />
      </div>

      {/* Poster grid */}
      <div className="mt-10 flex flex-wrap gap-4">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="skeleton aspect-[2/3] w-[calc(50%-0.5rem)] rounded-md sm:w-[8.5rem]"
          />
        ))}
      </div>
    </main>
  );
}
