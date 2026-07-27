-- Cinema Brain: following
--
-- Profiles are visible to anyone now that a profile has its own URL — the
-- username page is meant to be looked at by people other than its owner.
-- Replaces the owner-only select policy with a public one; update stays
-- owner-only.

drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

comment on table public.follows is 'One row per follow relationship: follower_id follows followee_id.';

-- Follower/following counts are read off the opposite column of the lookup
-- the primary key already covers.
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- Counts and "do I follow them" are shown on a public profile page, so reads
-- are open the same way profiles now are.
create policy "follows_select_public"
  on public.follows
  for select
  to anon, authenticated
  using (true);

create policy "follows_insert_own"
  on public.follows
  for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "follows_delete_own"
  on public.follows
  for delete
  to authenticated
  using ((select auth.uid()) = follower_id);
