-- Kino: posts, and the three things people do to them
--
-- Everything before this was something you did alone: a rating only you could
-- read, a watchlist only you could fill. `follows` was the first row that
-- pointed at someone else, and it had nothing to point at yet. This is what it
-- was for — a post is a film recommendation with a person attached, and the
-- feed is the reason to follow anyone.
--
-- Reads are public across all five tables, the way `profiles`, `follows` and
-- `user_movie_ratings` already are. A post is written to be read by strangers;
-- a like is a public count on it; a comment is signed. Writes stay owner-only,
-- which is the same shape every table here already has.
--
-- Counts are not stored. There is no `like_count` column and no trigger
-- keeping one in step, because PostgREST can aggregate an embedded relation
-- (`post_likes(count)`) in the same round trip that fetches the post, and a
-- denormalized counter is a second source of truth that drifts the first time
-- a delete takes a path nobody thought about. At feed scale the aggregate is
-- an index-only scan of the primary key; if it ever stops being one, the fix
-- is a materialized count added deliberately, not one added on day one.
--
-- No `updated_at` anywhere here either: nothing edits a post or a comment, so
-- a column that would always equal `created_at` is a promise the app doesn't
-- keep. Add it with the edit path that needs it.

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  -- Text is the post. A bare film with no words is what a watchlist is for,
  -- and 1000 characters is a paragraph or two — long enough for a real take,
  -- short enough that the feed stays scannable.
  constraint posts_body_length check (char_length(btrim(body)) between 1 and 1000)
);

comment on table public.posts is 'A user''s written take, optionally about one or more films. Publicly readable; written only by its author.';

-- The feed's own query: the most recent posts, regardless of author. Ranking
-- happens over the window this returns, so the index only has to make the
-- window cheap.
create index posts_recent_idx on public.posts (created_at desc);

-- The profile page's query: one author's posts, newest first.
create index posts_author_recent_idx on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;

create policy "posts_select_public"
  on public.posts
  for select
  to anon, authenticated
  using (true);

create policy "posts_insert_own"
  on public.posts
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

-- No update policy: a post is not editable, so there is nothing to allow.
create policy "posts_delete_own"
  on public.posts
  for delete
  to authenticated
  using ((select auth.uid()) = author_id);

-- ---------------------------------------------------------------------------
-- post_movies
-- ---------------------------------------------------------------------------

-- A post can name more than one film — "these two would make a double bill" is
-- exactly the post this feature exists for — so the link is its own table
-- rather than a `movie_id` column. An array of ids on `posts` would have been
-- shorter to write and would have given up the foreign key, the join, and the
-- index that answers "what has anyone said about this film".
create table public.post_movies (
  post_id  uuid not null references public.posts (id) on delete cascade,
  movie_id bigint not null references public.movies (id) on delete cascade,
  -- The order the author attached them in, preserved so a double bill reads in
  -- the order it was meant to. Postgres has no inherent row order to lean on.
  position smallint not null default 0,

  -- Naming the same film twice in one post is a no-op, not a second card.
  primary key (post_id, movie_id)
);

comment on table public.post_movies is 'Films a post is about. Ordered by `position`; the composite key makes attaching the same film twice a no-op.';

-- The reverse lookup: every post about a given film. Used by the feed's
-- affinity scoring, which asks about a hundred films at once.
create index post_movies_movie_idx on public.post_movies (movie_id);

alter table public.post_movies enable row level security;

create policy "post_movies_select_public"
  on public.post_movies
  for select
  to anon, authenticated
  using (true);

-- Ownership lives on the parent, so the check follows it there. Same shape as
-- chat_messages, which is scoped through its conversation.
create policy "post_movies_insert_own_post"
  on public.post_movies
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_movies.post_id
        and posts.author_id = (select auth.uid())
    )
  );

create policy "post_movies_delete_own_post"
  on public.post_movies
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_movies.post_id
        and posts.author_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- post_likes
-- ---------------------------------------------------------------------------

-- Same shape as `follows`: the row's existence is the whole fact, so the
-- composite key is the row's identity and liking twice is idempotent.
create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, user_id)
);

comment on table public.post_likes is 'One row per like. Publicly readable, so the count on a post is one embedded aggregate.';

-- post_id leads the primary key, which is what both reads want: the count for
-- one post, and "did this viewer like any of these hundred posts".
alter table public.post_likes enable row level security;

create policy "post_likes_select_public"
  on public.post_likes
  for select
  to anon, authenticated
  using (true);

create policy "post_likes_insert_own"
  on public.post_likes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "post_likes_delete_own"
  on public.post_likes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- post_reposts
-- ---------------------------------------------------------------------------

-- A repost is a like that also occupies space: it puts someone else's post in
-- front of your own followers. Structurally identical to a like, and kept as
-- its own table rather than a `kind` column on one, because the feed joins
-- against reposts and only counts likes.
create table public.post_reposts (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, user_id)
);

comment on table public.post_reposts is 'One row per repost. Surfaces someone else''s post in the reposter''s followers'' feeds.';

-- The feed reads this from the other end — "recent reposts by the people I
-- follow" — which the post_id-first primary key cannot serve.
create index post_reposts_user_recent_idx on public.post_reposts (user_id, created_at desc);

alter table public.post_reposts enable row level security;

create policy "post_reposts_select_public"
  on public.post_reposts
  for select
  to anon, authenticated
  using (true);

create policy "post_reposts_insert_own"
  on public.post_reposts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "post_reposts_delete_own"
  on public.post_reposts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- post_comments
-- ---------------------------------------------------------------------------

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  -- Half a post: a comment that wants a thousand characters wants to be a post.
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 500)
);

comment on table public.post_comments is 'A reply under a post. Flat — there is no parent_comment_id, and threading is not a feature.';

-- The thread, oldest first, which is how a conversation reads.
create index post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

create policy "post_comments_select_public"
  on public.post_comments
  for select
  to anon, authenticated
  using (true);

create policy "post_comments_insert_own"
  on public.post_comments
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

-- Two people can remove a comment: whoever wrote it, and whoever wrote the post
-- it sits under. The second is the only moderation this app has, and the
-- alternative is a comment its subject cannot get rid of.
create policy "post_comments_delete_own_or_post_author"
  on public.post_comments
  for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.posts
      where posts.id = post_comments.post_id
        and posts.author_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- profile search
-- ---------------------------------------------------------------------------

-- The people search matches a handle or a display name with ILIKE '%term%',
-- which no b-tree can serve. pg_trgm is already installed for `movies.title`
-- and answers the same question here.
--
-- Two indexes rather than one over a concatenation: `display_name` is null for
-- most accounts, and a combined expression index would have to coalesce, which
-- makes every row carry the handle twice.
create index profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);

create index profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);
