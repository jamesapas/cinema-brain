-- Watchlist and favorites.
--
-- One table rather than two: both are the same shape — a user, a film, and the
-- moment it was added — and the only thing that differs is which list it lands
-- in. Kept apart from user_movie_ratings because that table's rows mean "you
-- have an opinion about this" (its CHECK requires a rating or a note), while
-- these mean "you intend to" or "you love it", and a film can be on a list with
-- no opinion attached at all.

create table public.user_movie_lists (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id   bigint not null references public.movies (id) on delete cascade,
  -- Text with a CHECK rather than an enum: adding a third list later is a
  -- constraint change, not a type migration.
  list       text not null,
  created_at timestamptz not null default now(),

  -- The composite key is the whole row's identity: adding a film you already
  -- added is a no-op, which is exactly what an idempotent upsert wants.
  primary key (user_id, movie_id, list),
  constraint user_movie_lists_known_list check (list in ('watchlist', 'favorite'))
);

comment on table public.user_movie_lists is 'Per-user watchlist and favorites. RLS-scoped: a user only ever sees their own rows.';

-- The one query the profile page runs: this user's rows in one list, newest
-- added first.
create index user_movie_lists_user_list_recent_idx
  on public.user_movie_lists (user_id, list, created_at desc);

alter table public.user_movie_lists enable row level security;

-- Same shape as user_movie_ratings: one policy per action, auth.uid() wrapped
-- in a subselect so it's evaluated once per statement rather than once per row.
create policy "user_movie_lists_select_own"
  on public.user_movie_lists
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_movie_lists_insert_own"
  on public.user_movie_lists
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_movie_lists_delete_own"
  on public.user_movie_lists
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
