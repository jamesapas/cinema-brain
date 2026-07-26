-- Cinema Brain: shared movie catalog + per-user ratings/notes
--
-- Two tables with different ownership models:
--   movies             - shared read-only catalog, written only by the TMDB sync
--                        job running with the service role (bypasses RLS).
--   user_movie_ratings - private per-user rows, RLS-scoped to auth.uid().

create extension if not exists pg_trgm with schema extensions;

-- Shared updated_at trigger. search_path is pinned to avoid the mutable
-- search_path warning from Supabase's security advisor.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- movies
-- ---------------------------------------------------------------------------

create table public.movies (
  -- TMDB's movie id is the primary key: it makes the sync an idempotent upsert
  -- and gives Pinecone a stable vector id without an extra lookup.
  id                   bigint primary key,
  title                text not null,
  original_title       text,
  original_language    text,
  overview             text,
  tagline              text,
  release_date         date,
  release_year         integer generated always as (extract(year from release_date)::integer) stored,
  runtime              integer,
  genres               text[] not null default '{}',
  status               text,
  adult                boolean not null default false,
  popularity           real,
  vote_average         real,
  vote_count           integer,
  poster_path          text,
  backdrop_path        text,
  imdb_id              text,

  -- Pinecone sync bookkeeping: embedded_at is null (or the hash differs from
  -- the current embedding input) when a row needs to be re-embedded.
  embedding_input_hash text,
  embedded_at          timestamptz,

  synced_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint movies_runtime_nonneg check (runtime is null or runtime >= 0),
  constraint movies_vote_average_range check (vote_average is null or vote_average between 0 and 10)
);

comment on table public.movies is 'Shared movie catalog mirrored from the TMDB API. Read-only to end users.';
comment on column public.movies.id is 'TMDB movie id; also used as the Pinecone vector id.';
comment on column public.movies.genres is 'Denormalized TMDB genre names, e.g. {Drama,"Science Fiction"}.';

create index movies_genres_idx on public.movies using gin (genres);
create index movies_release_year_idx on public.movies (release_year);
create index movies_popularity_idx on public.movies (popularity desc nulls last);
create index movies_vote_average_idx on public.movies (vote_average desc nulls last);
create index movies_title_trgm_idx on public.movies using gin (title extensions.gin_trgm_ops);

-- Worklist for the embedding job.
create index movies_pending_embedding_idx on public.movies (id) where embedded_at is null;

create trigger movies_set_updated_at
  before update on public.movies
  for each row execute function public.set_updated_at();

alter table public.movies enable row level security;

-- Catalog is readable by any signed-in user. No insert/update/delete policies:
-- writes are reserved for the service role, which bypasses RLS.
create policy "movies_select_authenticated"
  on public.movies
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- user_movie_ratings
-- ---------------------------------------------------------------------------

create table public.user_movie_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id   bigint not null references public.movies (id) on delete cascade,
  -- 1-10 to match TMDB's scale; null means the user saved a note without rating.
  rating     smallint,
  notes      text,
  watched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_movie_ratings_unique_per_user unique (user_id, movie_id),
  constraint user_movie_ratings_rating_range check (rating is null or rating between 1 and 10),
  constraint user_movie_ratings_not_empty check (rating is not null or notes is not null)
);

comment on table public.user_movie_ratings is 'Per-user ratings and notes. RLS-scoped: a user only ever sees their own rows.';

create index user_movie_ratings_user_recent_idx
  on public.user_movie_ratings (user_id, created_at desc);
create index user_movie_ratings_movie_id_idx
  on public.user_movie_ratings (movie_id);

create trigger user_movie_ratings_set_updated_at
  before update on public.user_movie_ratings
  for each row execute function public.set_updated_at();

alter table public.user_movie_ratings enable row level security;

-- Separate policy per action. auth.uid() is wrapped in a subselect so Postgres
-- evaluates it once per statement instead of once per row.
create policy "user_movie_ratings_select_own"
  on public.user_movie_ratings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_movie_ratings_insert_own"
  on public.user_movie_ratings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_movie_ratings_update_own"
  on public.user_movie_ratings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_movie_ratings_delete_own"
  on public.user_movie_ratings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
