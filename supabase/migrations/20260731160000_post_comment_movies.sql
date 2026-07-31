-- Kino: movies attached to comments
--
-- Structurally identical to `post_movies`. A comment can name one or more films.

create table public.post_comment_movies (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  movie_id bigint not null references public.movies (id) on delete cascade,
  position smallint not null default 0,

  primary key (comment_id, movie_id)
);

comment on table public.post_comment_movies is 'Films a comment is about. Ordered by position; the composite key makes attaching the same film twice a no-op.';

create index post_comment_movies_movie_idx on public.post_comment_movies (movie_id);

alter table public.post_comment_movies enable row level security;

create policy "post_comment_movies_select_public"
  on public.post_comment_movies
  for select
  to anon, authenticated
  using (true);

create policy "post_comment_movies_insert_own_comment"
  on public.post_comment_movies
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.post_comments
      where post_comments.id = post_comment_movies.comment_id
        and post_comments.author_id = (select auth.uid())
    )
  );

create policy "post_comment_movies_delete_own_comment"
  on public.post_comment_movies
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.post_comments
      where post_comments.id = post_comment_movies.comment_id
        and post_comments.author_id = (select auth.uid())
    )
  );

-- Allow empty text body on comments if films are attached
alter table public.post_comments drop constraint if exists post_comments_body_length;
alter table public.post_comments add constraint post_comments_body_length check (char_length(btrim(body)) <= 500);

-- Allow empty text body on posts if films are attached
alter table public.posts drop constraint if exists posts_body_length;
alter table public.posts add constraint posts_body_length check (char_length(btrim(body)) <= 1000);
