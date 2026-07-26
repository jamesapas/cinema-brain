/**
 * Removes zero-byte entries from Next's image-optimizer cache.
 *
 *   npm run clean:image-cache   (also runs automatically before `npm run dev`)
 *
 * Why this exists: `writeToCacheDir` in Next's image optimizer writes the
 * optimized image straight to its final path — no temp file, no rename. Kill
 * the dev server mid-write (Ctrl-C during a page load, a crash, a sleeping
 * laptop) and a 0-byte file is left behind.
 *
 * That file is not merely useless. On the next start, the optimizer replays
 * every cached entry into an LRU whose size function is the byte length, and
 * `lru.set(key, 0)` throws "calculateSize returned 0, but size must be > 0".
 * The throw happens inside a module-level promise that nothing catches, so it
 * surfaces as an unhandledRejection and every image write for the rest of the
 * process fails with "Failed to write image to cache". One truncated file
 * disables image caching until it is deleted.
 */

import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// Dev and build keep separate caches; both can be poisoned the same way.
const CACHE_DIRS = [".next/dev/cache/images", ".next/cache/images"];

async function pruneEmptyEntries(cacheDir: string): Promise<string[]> {
  const keys = await readdir(cacheDir).catch(() => null);
  if (keys === null) return []; // No cache yet — nothing to do.

  const removed: string[] = [];

  for (const key of keys) {
    const entryDir = join(cacheDir, key);
    const files = await readdir(entryDir).catch(() => []);

    // An entry is one file. Empty of files, or holding a 0-byte one, means an
    // interrupted write.
    const sizes = await Promise.all(
      files.map(async (file) => (await stat(join(entryDir, file))).size),
    );

    if (files.length === 0 || sizes.some((size) => size === 0)) {
      await rm(entryDir, { recursive: true, force: true });
      removed.push(key);
    }
  }

  return removed;
}

async function main() {
  for (const cacheDir of CACHE_DIRS) {
    const removed = await pruneEmptyEntries(cacheDir);
    if (removed.length > 0) {
      console.log(
        `Removed ${removed.length} truncated image cache ${
          removed.length === 1 ? "entry" : "entries"
        } from ${cacheDir}.`,
      );
    }
  }
}

main().catch((error: unknown) => {
  // Never block `npm run dev` over cache housekeeping.
  console.warn(
    `Image cache cleanup skipped: ${error instanceof Error ? error.message : error}`,
  );
});
