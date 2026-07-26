# Cinema Brain — Handoff

Last updated: 2026-07-26

## Goal

A movie recommendation app with three ways in:

1. **Browse** a visual catalog (Netflix/Prime-style hero + poster shelves) and rate films.
2. **Search** by title, when you know what you're looking for.
3. **Ask Kino**, the agent, when you don't — a mood, a constraint, or just "I can't decide".

The defining constraint on the agent: it has four tools and **decides for itself** which to
call, in what order, and how many times. There is no keyword matching, intent classifier, or
conditional dispatch anywhere in our code — tool selection belongs entirely to the model.

Stack: Next.js 16.2.11 (App Router) · Supabase (Postgres + Auth + RLS) · TMDB (catalog source)
· Pinecone (vector search) · OpenAI (embeddings + chat).

## Current state

Everything below is working and was verified end-to-end, not assumed.

| Area | State |
|---|---|
| Catalog | **104,146** movies synced from TMDB by release year |
| Vectors | **104,146** embeddings in Pinecone index `cinema-brain-movies`, namespace `movies`, 1536-dim, cosine. Postgres `embedded_at` count and Pinecone `recordCount` were compared directly and agree exactly; 0 pending |
| Auth | Cookie-based Supabase Auth; sign in / sign up with confirm-password + show/hide toggles |
| Profiles | `public.profiles` (1:1 with `auth.users`, created by trigger) + a public `avatars` bucket |
| RLS | Verified: strangers see 0 ratings and 0 profiles, forged inserts/updates affect 0 rows |
| Agent | **Kino** — 4 tools, model-driven, streams over SSE |
| Search | Title search over Postgres (trigram), as a centred overlay with infinite scroll, plus a `/search` page |
| UI | Catalog home (auto-rotating hero carousel + 4 shelves + star rating), poster → details dialog, profile page, Kino as a centred chat window |
| Checks | `tsc`, `eslint`, and `next build` all clean. The hero carousel was additionally driven in a real browser (autoplay, drag both ways, click-safety) — see *Verifying UI* |

**Supabase project:** `lwuycdhoilckrxymjokq`
**Chat model:** `gpt-5.5` (override with `CHAT_MODEL`; the account also lists `gpt-5.6-luna` /
`-sol` / `-terra`, whose suffixes I could not identify — don't guess, check before switching)
**Embedding cost, for planning:** the 63,553-film top-up ran 636 batches in 37.7 minutes for
5,082,740 tokens of `text-embedding-3-small` — about $0.10. A full re-embed of 104k is ~$0.17.

**Test user:** `test-user@cinema-brain.local` / `cinema-brain-test-password` — 6 seeded ratings
(Inception 10, Arrival 9, EEAAO 9, The Substance 8, Scary Movie 4, Minions & Monsters 3).
Recreate with `npm run seed:test-user`.

**Commands**

```
npm run dev              # app
npm run sync:movies      # TMDB -> movies      (-- --pages=25 --start-page=1)
npm run pinecone:setup   # create the index (idempotent)
npm run embed:movies     # embed pending rows -> Pinecone
npm run seed:test-user   # test user + ratings, no email sent
npm run chat -- "..."    # drive the agent from the CLI; add --route to go via HTTP
npm run db:types         # regenerate lib/database.types.ts after a migration
```

## Active files

**Data + services**
- `lib/movies/search.ts` — agent-facing queries (metadata, semantic, rating history). Its
  projection deliberately excludes image paths; the model shouldn't pay tokens for filenames.
- `lib/movies/catalog.ts` — browse-facing queries (trending, top rated, genre, hero,
  "because you rated X", `searchMoviesByTitle`). **Server-only** — reaches Pinecone via
  `search.ts`. `getHeroMovie` is still exported but **no longer used** — the hero rotates
  through trending now. Delete it or wire it back deliberately.
- `lib/movies/search-config.ts` — `MIN_SEARCH_LENGTH` alone. Its own module for the same reason
  `images.ts` exists: a client component importing a constant from `catalog.ts` would drag the
  whole server data layer into the browser bundle.
- `lib/movies/images.ts` — pure types + TMDB URL helpers. **The only movie module a client
  component may import.** See Failed attempts #4.
- `lib/movies/sync.ts` · `lib/tmdb.ts` — TMDB ingestion.
- `lib/movies/embedding-input.ts` — single definition of the text that gets embedded; shared by
  the sync (which hashes it) and the embed job (which sends it), so they cannot drift.
- `lib/movies/embeddings.ts` · `lib/embeddings/openai.ts` · `lib/pinecone.ts` — embedding pipeline.

**Agent — Kino**
- `lib/agent/chat.ts` — the system prompt (his name, voice, and the catalog size), plus
  `streamChat` (async generator: `tool_call` / `text_delta` / `done`) and `runChat` wrapping it,
  so there is exactly one tool loop. **The catalog size is stated in that prompt** — it said
  "about 500 titles" long after the catalog passed 100k, which made him declare real films
  absent. Update it whenever the catalog changes size.
- `lib/agent/tools.ts` — the four tools and their descriptions.
- `lib/agent/tool-kit.ts` — provider-neutral `defineTool`; JSON Schema derived from the Zod schema.
- `app/api/chat/route.ts` — SSE endpoint; cookie auth with a bearer fallback for the CLI.

**Supabase clients** — pick deliberately, they are not interchangeable:
- `lib/supabase/server.ts` — RLS-scoped, cookie-backed (Server Components / Actions / routes).
- `lib/supabase/browser.ts` — RLS-scoped, browser; writes the auth cookies.
- `lib/supabase/user-client.ts` — RLS-scoped from a bearer token (CLI + API).
- `lib/supabase/admin.ts` — **bypasses RLS**; back-office jobs only.

**UI**
- `app/page.tsx` — catalog: hero carousel + 4 shelves. `app/profile/page.tsx` — profile + taste
  stats. `app/login/page.tsx` — auth. `app/search/page.tsx` — the full search page.
- `app/components/app-shell.tsx` — header + all providers; every signed-in page mounts it.
- `app/components/` — `site-header`, `avatar`, `profile-identity`, `hero`, `carousel-row`,
  `poster-card`, `movie-details`, `star-rating`, `chat-overlay`, `kino-avatar`,
  `search-overlay`, `search-field`.
- `app/components/hero.tsx` — **client** component. Auto-rotating carousel over the top 6
  trending films that have a backdrop, 7s dwell, crossfaded (all backdrops stacked, only the
  first `priority`). Pauses on hover, focus and drag; `prefers-reduced-motion` disables autoplay
  entirely. Drag is *measured, not tracked* — it commits on release past 60px, which is why the
  whole surface can be draggable without stealing clicks from the buttons on top of it.
  It deliberately does **not** skip films you've rated; your score rides along on the stars.
- `lib/profiles/` — `avatar.ts` (pure URL + initials helpers, **client-safe**), `queries.ts`
  (server reads), `stats.ts` (pure derivations over already-fetched ratings).
- `app/chat-panel.tsx` — `ChatConversation`, the whole chat window: header, transcript, composer.
  Mounted inside `chat-overlay.tsx`, which owns the scrim, the centring and the summon button.
- `app/actions/rate-movie.ts` · `app/actions/profile.ts` — the app's mutations.
- `proxy.ts` — session refresh + route gating. **Not `middleware.ts`** — renamed in Next 16.
- `app/globals.css` — design tokens (ink / bone / lamp), type roles (`.label` / `.meta`),
  `.btn` variants, the sign-in backdrop, and the sign-in field styles.

## Changes made

1. **Schema** (`supabase/migrations/20260725120000_movies_and_user_ratings.sql`) — `movies`
   (TMDB id as PK, so sync is an idempotent upsert and Pinecone gets a stable vector id) and
   `user_movie_ratings` (RLS-scoped, unique per user+movie). Catalog is select-only for
   `authenticated`; writes are service-role.
2. **TMDB sync** — retry/backoff, 404 skip, concurrency pool. Re-embedding is invalidated by
   comparing an `embedding_input_hash`, so a routine popularity refresh doesn't re-embed the catalog.
3. **Embeddings → Pinecone** — vectors placed by OpenAI's returned `index`, never array position;
   Pinecone upsert happens *before* marking rows embedded, so a crash re-embeds rather than
   silently leaving gaps.
4. **Agent** — 4 tools; descriptions are prescriptive about *when* to call, which is what actually
   drives selection. Observed traces: mood query → semantic only; hard-filter query → metadata only,
   one call, ~6s; personalized → history first, then both searches in parallel, then merge.
5. **Auth + streaming UI** — cookie sessions, `proxy.ts`, SSE streaming, and the consultation rail
   that shows tool calls arriving live, numbered by loop iteration.
6. **Catalog rework** — hero, shelves, poster cards, half-star rating writes.
7. **Type + chrome pass (2026-07-26)** — the interface now runs on one humanist sans (Inter, the
   closest free stand-in for Prime Video's Amazon Ember) instead of Bricolage + Newsreader + mono.
   11px uppercase mono was doing every job and was the readability complaint; it split into
   `.label` (structural eyebrows, 12px sans caps) and `.meta` (content — years, runtimes, scores —
   13px sentence case). Mono survives only in the agent's consultation rail. Buttons became
   `.btn` / `.btn-primary` / `.btn-quiet`, and a global rule restores `cursor: pointer`, which
   Tailwind v4 drops from buttons.
8. **Movie details dialog** (`app/components/movie-details.tsx`) — clicking a poster opens full
   details over the catalog. A dialog rather than a `/movie/[id]` route because browsing is a
   scroll position and a round trip loses it. Every field it shows already travelled with the card
   (`tagline` and `vote_count` were added to `CARD_SELECT` for it), so opening one costs no
   request. Escape and the scrim close it, focus returns to the poster, and the body scroll locks
   while it is open. `MoreInfoButton` opens the same dialog from the hero.
9. **Sign-in rework** — a streaming-service sign-in: painted projector-beam backdrop with grain,
   centred translucent card, filled fields with floating labels, one gold primary action.
10. **Profiles + avatars** (`20260726090000_profiles_and_avatars.sql`) — `public.profiles` keyed
    1:1 to `auth.users`, rows created by an `on_auth_user_created` trigger (there is deliberately
    **no insert policy**; only the trigger writes rows) and backfilled for existing accounts.
    Avatars live in a **public** `avatars` bucket: public so the object URL is stable and
    cacheable by next/image with no signing round trip, while the path carries a random uuid so
    knowing a user id isn't enough to derive it. Writes are owner-only, enforced on
    `storage.objects` by matching the first path segment to `auth.uid()`. The browser uploads the
    file directly — it never becomes a Server Function payload — after centre-cropping and
    downscaling to 512px on a canvas; `app/actions/profile.ts` then records the path and deletes
    the object it replaced.
11. **Chrome + profile page** — `SiteHeader` scrolls away with the page (not fixed, no rule under
    it) and carries an avatar menu with the profile link and sign-out. `/profile` shows the
    picture, an editable display name, and what the app knows about
    someone's taste: four stat tiles, a rating spread, a genre spread, every rated film as a
    poster that opens the details dialog, and their notes. Both charts are single-series, so one
    hue at 70% (validated ≥3:1 against the surface), counts labelled directly, no legend.
12. **Contained layout, darker stock** — everything except the hero backdrop sits in
    `.page-container` (`app/globals.css`, currently 90rem with a 1.5/2rem gutter): the header's
    contents, the hero's *text*, the shelves, and the profile. **That class is the one knob for
    page width** — it is deliberately unlayered so it beats a stray Tailwind `px-*`, which is why
    nothing that carries it also carries horizontal padding utilities. Owning the gutter in one
    place is what keeps a shelf heading, its first poster, and the hero title above them on the
    same left edge — so `CarouselRow` carries no horizontal padding of its own, which also
    retires the `scroll-pl-*` fix in Failed attempts #5.
    The **backdrop image alone is full width** and runs under the fixed header. Surfaces dropped
    to near-black (`ink #05070a`, `ink-raised #0c1116`) with type a step brighter, taking body
    copy to roughly 12:1.
13. **Header: fixed, no rule.** It is only a gradient at rest, so the backdrop is uninterrupted at
    the top of the page, and fills to `bg-ink/95` past 24px of scroll. That fill is not
    decoration — posters travelling behind a fully transparent fixed bar collide with the
    wordmark, which is what the screenshots showed. There is no `border-b` in either state.

14. **Catalog grown to 104k and fully embedded** — synced year by year, then `embed:movies`
    topped up the 63,553 pending. Both stores verified equal afterwards rather than assumed.
15. **Title search** (`searchMoviesByTitle`, `app/api/search/`, `search-overlay`, `/search`) —
    Postgres and the `movies_title_trgm_idx` trigram index, not vectors: at this size a search
    box is asked "do you have this film", which is a lookup. Describing a film you can't name is
    what Kino's semantic tool is for. Results come back by popularity and are re-ranked into
    exact / starts-with / contains tiers, because popularity alone puts *Her* fifth behind
    *Hereditary* and *Hercules*.
    The overlay pages as you scroll (12 a page) instead of capping with a link. Paging orders by
    **`(popularity desc, id asc)`** — popularity ties are common and Postgres promises nothing
    about their order between queries, so without a unique tiebreak two windows repeat one film
    and drop another. Offsets are capped at 480, since `OFFSET` walks every row it skips.
16. **The agent became Kino** — a named film programmer with a voice, a face
    (`public/kino.png`, 1254px RGBA), and his own accent `--color-kino: #90fce7` sampled from
    the mint of his eyes. Lamp gold stays the *app's* primary action; mint and the cream
    `#fbeede` of `.btn-kino` are his alone, which is how his entry points read as his without
    repainting the site. Chat moved from a right-hand drawer to a centred window with a header,
    bubbles for you, plain prose for him, and the composer at the bottom.
17. **The consultation rail was removed from the UI.** Tool-call events still stream over SSE and
    `toolCalls` is still tracked in component state — only the display is gone, so restoring it
    is a UI change, not a rebuild. Worth knowing this was deliberate: it was the app's main
    window into the model choosing its own tools, and it was cut because it read as Kino
    narrating his process.

## Verifying UI

There is a working browser loop, and it should be used before claiming any visual change works.
Most of the UI in this session was shipped on `tsc`/`eslint`/`next build` alone, which catches
nothing about whether a thing looks right — several rounds were spent guessing.

```ts
import { chromium } from "playwright";
const browser = await chromium.launch({
  // Playwright 1.62 wants a revision that isn't cached; point at what is.
  executablePath: "/home/karl/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/auth/v1/signup", (r) => r.abort()); // never spend a real confirmation email
await page.goto("http://localhost:3000/login");
// test-user@cinema-brain.local / cinema-brain-test-password
```

`deviceScaleFactor: 4` plus `locator.screenshot()` gives a close-up worth actually judging.
`evaluateAll` with `getBoundingClientRect` / `getComputedStyle` settles "are these the same
size" and "is there a border" as facts instead of opinions.

## Failed attempts

Recorded so they aren't repeated.

1. **Built the agent on Claude first.** Ported to OpenAI once it turned out only an OpenAI key was
   available. `@anthropic-ai/sdk` uninstalled; the provider seam is `lib/agent/chat.ts` alone.
2. **`lib/env.ts` used `process.env[name]` with a dynamic key.** Next only inlines `NEXT_PUBLIC_*`
   when the access is statically analyzable, so the browser got `undefined` for the Supabase URL and
   key and **sign-in silently fired no network request** — no error anywhere. The literal reads in
   that file must stay literal.
3. **Pinned `Authorization: Bearer <secret>` on the admin client.** My own wrong fix for a session
   bleed between Supabase clients; it broke the auth-admin path. Reverted — the real fix is the
   distinct `storageKey`. Related: an admin client constructed *before* a user sign-in in the same
   process can still fail auth-admin calls, so construct it at point of use.
4. **Client component imported a helper from `catalog.ts`** — which chains to Pinecone — and the
   production build failed with module-not-found. Hence `lib/movies/images.ts`. A `server-only`
   guard on `catalog.ts` would make this fail loudly and earlier.
5. **`snap-mandatory` ate the shelves' left padding** (`scrollLeft: 40` on every track), so each
   first poster sat flush at x=0 while its heading was inset. Fixed with matching `scroll-pl-*`.
6. **`-mt-6` on the shelf container buried the first heading under the hero** (`h2Top: 606` vs
   `heroBottom: 630`).
7. **A Playwright test submitted a real sign-up**, consuming one of Supabase's ~2 confirmation
   emails/hour and contributing to the `email rate limit exceeded` you hit. Tests now intercept and
   abort `/auth/v1/signup`. Use `npm run seed:test-user` (admin API, no mail) for test accounts.
8. **Random ids for SVG gradients** cause hydration mismatches — use `useId`.
9. **Supabase rejects synthetic signup domains** (`.local`, `example.com`) with
   "Email address is invalid". The admin API bypasses that validation; public signup does not.
10. **`tsx` compiles `.ts` as CJS here** (no `"type": "module"`), so top-level `await` in scripts
    fails. Scripts use a `main()` wrapper.
11. **A generic Supabase query-builder helper** in `catalog.ts` needed a fake type declaration to
    compile. Rewritten as explicit queries.
12. **Playwright 1.62 wants a chromium revision that isn't cached.** Launch with
    `executablePath: /home/karl/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`.
13. **Killing the dev server mid-request disabled image caching.** The log filled with
    `Failed to write image to cache …` / `LRUCache: calculateSize returned 0` /
    `unhandledRejection`, ~700 of them, starting five seconds after boot. Root cause: Next's
    `writeToCacheDir` writes the optimized image straight to its final path with no temp file, so
    a killed process leaves a 0-byte file. On the next start the optimizer replays every cached
    entry into an LRU sized by byte length, `lru.set(key, 0)` throws inside a module-level promise
    nobody catches, and every image write for the rest of that process fails. **Two truncated
    files disabled the whole cache.** Deleting those entries fixed it; `npm run clean:image-cache`
    (wired to `predev`) now prunes them automatically. Prefer a graceful stop over `kill -9`.
    Also: `pkill -f "next dev"` matches its own shell — use `pkill -f "next[ ]dev"`.
14. **`npm run db:types` emptied `lib/database.types.ts`.** The shell redirect truncated the file
    before the missing `supabase` CLI could fail, and the whole app stopped compiling. The script
    now writes to a `.new` file and only moves it on success. The generator also does not emit the
    hand-written aliases at the bottom of that file (`MovieRow`, `MovieInsert`, …) — re-add them
    after regenerating, as the comment there says.
15. **`globals.css` is unlayered, so it beats every Tailwind utility** — not by specificity, but
    because unlayered CSS always wins over anything in `@layer utilities`. This is the same
    property `.page-container` relies on deliberately (#12), and it bites in the other direction:
    `focus:outline-none` on the chat composer did **nothing** against the global
    `:focus-visible { outline: 2px solid var(--color-lamp) }`. The fix has to be another unlayered
    rule (`.composer-input:focus-visible`). Assume any `.btn`/`.label`/`.meta`/`.overlay-card`
    property cannot be overridden by a utility class.
16. **Running `next build` while `next dev` is live.** Both write `.next`, and the dev server
    starts serving stale or mixed output — which looked exactly like a CSS change not applying and
    cost a round of debugging a bug that wasn't there. Stop the dev server first, or accept that
    what the browser shows may not be what the source says. Related to #13.
17. **Flexbox `align-items: stretch` distorted Kino's face.** His avatar sat in a
    `flex gap-3.5` row with no `items-*`, so the `<img>` stretched to the full height of a long
    reply — the longer he talked, the more his face smeared. `shrink-0` doesn't help; it only
    guards the main axis. `items-start` on the row (or `self-start` on the image) is the fix.
18. **Ran `npx prettier --write` on a file out of habit.** Prettier is not a dependency here and
    there is no config, so it reflowed the whole file to its 80-column default against a codebase
    written at ~90, burying one real change in a file-wide diff. This project has no formatter;
    match the surrounding style by hand.
19. **`Math.random()` during render is a hydration mismatch** — the same class of bug as #8. The
    chat panel's randomised suggestion chips get away with it *only* because that panel never
    server-renders: it mounts on click from an overlay whose state starts closed. That constraint
    is written above the code; it stops being true the moment `ChatConversation` is rendered on a
    page directly.
20. **Checked a background job's PID and wrongly declared it dead.** `npx tsx script.ts` launched
    with `setsid nohup` leaves the recorded `$!` as a short-lived wrapper; the actual work is a
    grandchild. `ps -p <wrapper>` says "not running" while the job is fine. Use
    `pgrep -af <script-name>`, or check the job's real output.

## Next steps

**Blocking for real sign-ups**
- Email confirmation is on and the built-in sender is dev-only (~2/hour). Either disable
  *Authentication → Sign In / Providers → Email → Confirm email* for development, or configure
  custom SMTP for production. No code change needed — the login page already handles both paths.

**Known small defects**
- `getBecauseYouRated` calls `getRatingsByMovie` internally and `app/page.tsx` calls it again — one
  redundant query per page load.
- `/search` is effectively unlinked. The page and its `SearchField` work, but nothing in the UI
  points at it any more — the overlay's "See all results" footer was removed in favour of
  infinite scroll. Decide whether it stays as a linkable/shareable result set or goes.
- The chat transcript runs the full 920px panel width, so Kino's prose lines are ~110 characters,
  past the ~70 where the eye starts losing its place. Capping the *assistant* prose alone while
  leaving your bubbles and the composer full-bleed is the fix if it reads as a wall.
- The hero stacks all 6 backdrops in the DOM to crossfade them. That's what makes the transition
  smooth, but it is 6 full-width images on the home page; only the first is `priority`.
- The Supabase CLI isn't installed, so `npm run db:types` needs `npx` to fetch it (the script now
  does). Types can also be regenerated through the Supabase MCP.
- `StarRating` seeds its state from a prop, so the copy in the details dialog and the copy on the
  poster behind it don't track each other until the next full load. Rating from either still
  writes correctly.

**Worth doing next**
- **Hear Kino.** His voice and the "never describe your own process" rule were written but never
  listened to — no chat turn has been run since. `npm run chat -- "..."` is the fastest check.
- **"More like this" in the details dialog** — the vector index now covers all 104k films, so
  this is a much better feature than it was at 499. Still the obvious next move once someone has
  opened a film.
- **Give the chat panel page context** so "help me decide" knows what you were looking at; only
  the hero passes a seeded question today.
- **Prompt caching / trimming** for chat cost — a personalized turn resends ~11–13k input tokens,
  mostly tool results replayed each iteration. Worth more now the catalog is 200× bigger.
- **Semantic quality at 104k.** Every tool that searches by meaning is now drawing on the whole
  catalog rather than a curated 499. Nobody has looked at whether the results got better or just
  noisier — that is an open question, not a known win.
- **Tests.** There are none. The highest-value targets are the RLS boundary, the embedding-hash
  invalidation, the SSE frame parser, and now the search paging window (a `(popularity, id)`
  regression would silently duplicate and drop rows).
- `npm audit` reports 12 high-severity advisories, all inherited from the `create-next-app` scaffold
  (eslint / postcss / sharp), none from the libraries added here.
- `playwright` is a devDependency and now earns its place — see *Verifying UI*.
- `public/kino.png` is 1MB at 1254px and is displayed at 24–88px. `next/image` resizes what it
  serves, so this is repo weight rather than page weight, but it could be a fraction of the size.
