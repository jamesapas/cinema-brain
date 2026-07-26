# Cinema Brain — Handoff

Last updated: 2026-07-26

## Goal

A movie recommendation app with two ways in:

1. **Browse** a visual catalog (Netflix/Prime-style hero + poster shelves) and rate films.
2. **Ask** a chat agent for recommendations.

The defining constraint on the agent: it has four tools and **decides for itself** which to
call, in what order, and how many times. There is no keyword matching, intent classifier, or
conditional dispatch anywhere in our code — tool selection belongs entirely to the model.

Stack: Next.js 16.2.11 (App Router) · Supabase (Postgres + Auth + RLS) · TMDB (catalog source)
· Pinecone (vector search) · OpenAI (embeddings + chat).

## Current state

Everything below is working and was verified end-to-end, not assumed.

| Area | State |
|---|---|
| Catalog | 499 movies synced from TMDB; `poster_path`/`backdrop_path` 100% populated |
| Vectors | 499 embeddings in Pinecone index `cinema-brain-movies`, namespace `movies`, 1536-dim, cosine |
| Auth | Cookie-based Supabase Auth; sign in / sign up with confirm-password + show/hide toggles |
| Profiles | `public.profiles` (1:1 with `auth.users`, created by trigger) + a public `avatars` bucket |
| RLS | Verified: strangers see 0 ratings and 0 profiles, forged inserts/updates affect 0 rows |
| Agent | 4 tools, model-driven, streams over SSE |
| UI | Catalog home (hero + 4 shelves + star rating), poster → details dialog, profile page, chat as slide-out drawer |
| Checks | `tsc`, `eslint`, and `next build` all clean; no browser console errors |

**Supabase project:** `lwuycdhoilckrxymjokq`
**Chat model:** `gpt-5.5` (override with `CHAT_MODEL`; the account also lists `gpt-5.6-luna` /
`-sol` / `-terra`, whose suffixes I could not identify — don't guess, check before switching)

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
  "because you rated X"). **Server-only** — reaches Pinecone via `search.ts`.
- `lib/movies/images.ts` — pure types + TMDB URL helpers. **The only movie module a client
  component may import.** See Failed attempts #4.
- `lib/movies/sync.ts` · `lib/tmdb.ts` — TMDB ingestion.
- `lib/movies/embedding-input.ts` — single definition of the text that gets embedded; shared by
  the sync (which hashes it) and the embed job (which sends it), so they cannot drift.
- `lib/movies/embeddings.ts` · `lib/embeddings/openai.ts` · `lib/pinecone.ts` — embedding pipeline.

**Agent**
- `lib/agent/chat.ts` — `streamChat` (async generator: `tool_call` / `text_delta` / `done`) and
  `runChat` wrapping it, so there is exactly one tool loop.
- `lib/agent/tools.ts` — the four tools and their descriptions.
- `lib/agent/tool-kit.ts` — provider-neutral `defineTool`; JSON Schema derived from the Zod schema.
- `app/api/chat/route.ts` — SSE endpoint; cookie auth with a bearer fallback for the CLI.

**Supabase clients** — pick deliberately, they are not interchangeable:
- `lib/supabase/server.ts` — RLS-scoped, cookie-backed (Server Components / Actions / routes).
- `lib/supabase/browser.ts` — RLS-scoped, browser; writes the auth cookies.
- `lib/supabase/user-client.ts` — RLS-scoped from a bearer token (CLI + API).
- `lib/supabase/admin.ts` — **bypasses RLS**; back-office jobs only.

**UI**
- `app/page.tsx` — catalog: hero + 4 shelves. `app/profile/page.tsx` — profile + taste stats.
  `app/login/page.tsx` — auth.
- `app/components/app-shell.tsx` — header + both providers; every signed-in page mounts it.
- `app/components/` — `site-header`, `avatar`, `avatar-uploader`, `display-name-form`, `hero`,
  `carousel-row`, `poster-card`, `movie-details`, `star-rating`, `chat-drawer`.
- `lib/profiles/` — `avatar.ts` (pure URL + initials helpers, **client-safe**), `queries.ts`
  (server reads), `stats.ts` (pure derivations over already-fetched ratings).
- `app/chat-panel.tsx` — `ChatConversation`, mounted inside the drawer.
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
13. **`npm run db:types` emptied `lib/database.types.ts`.** The shell redirect truncated the file
    before the missing `supabase` CLI could fail, and the whole app stopped compiling. The script
    now writes to a `.new` file and only moves it on success. The generator also does not emit the
    hand-written aliases at the bottom of that file (`MovieRow`, `MovieInsert`, …) — re-add them
    after regenerating, as the comment there says.

## Next steps

**Blocking for real sign-ups**
- Email confirmation is on and the built-in sender is dev-only (~2/hour). Either disable
  *Authentication → Sign In / Providers → Email → Confirm email* for development, or configure
  custom SMTP for production. No code change needed — the login page already handles both paths.

**Known small defects**
- `getBecauseYouRated` calls `getRatingsByMovie` internally and `app/page.tsx` calls it again — one
  redundant query per page load.
- The floating "Help me decide" button can overlap content at some scroll positions — a poster on
  the catalog, a genre bar on the profile. Inherent to a fixed trigger; it wants a real answer
  (dock it into the header, or hide it while scrolling) rather than more padding.
- The Supabase CLI isn't installed, so `npm run db:types` needs `npx` to fetch it (the script now
  does). Types can also be regenerated through the Supabase MCP.
- `StarRating` seeds its state from a prop, so the copy in the details dialog and the copy on the
  poster behind it don't track each other until the next full load. Rating from either still
  writes correctly.

**Worth doing next**
- **"More like this" in the details dialog** — the vector index is right there, and it's the
  obvious next move once someone has opened a film.
- **Give the chat drawer page context** so "help me decide" knows what you were looking at; only the
  hero passes a seeded question today.
- **Prompt caching / trimming** for chat cost — a personalized turn resends ~11–13k input tokens,
  mostly tool results replayed each iteration.
- **Grow the catalog**: `npm run sync:movies -- --pages=50 --start-page=26`, then
  `npm run embed:movies`. Both are idempotent and safe to re-run.
- **Tests.** There are none. The highest-value targets are the RLS boundary, the embedding-hash
  invalidation, and the SSE frame parser.
- `npm audit` reports 12 high-severity advisories, all inherited from the `create-next-app` scaffold
  (eslint / postcss / sharp), none from the libraries added here.
- `playwright` is a devDependency added for UI verification — keep it or drop it deliberately.
