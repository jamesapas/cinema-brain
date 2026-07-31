-- Kino: notifications for likes, comments, reposts, and follows

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id     uuid not null references auth.users (id) on delete cascade,
  type         text not null check (type in ('like', 'comment', 'repost', 'follow')),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.post_comments (id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.notifications is 'User notifications generated on likes, comments, reposts, and follows.';

create index notifications_recipient_recent_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id, read) where read = false;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = recipient_id);

create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = recipient_id);

create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = recipient_id);

-- ---------------------------------------------------------------------------
-- Trigger functions for auto-creating & deleting notifications
-- ---------------------------------------------------------------------------

-- 1. Post Likes Trigger Function
create or replace function public.handle_post_like_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  target_author_id uuid;
begin
  select author_id into target_author_id from public.posts where id = new.post_id;
  if target_author_id is not null and target_author_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (target_author_id, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;

create trigger on_post_like_created
  after insert on public.post_likes
  for each row
  execute function public.handle_post_like_notification();

create or replace function public.handle_post_unlike_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.notifications
  where type = 'like'
    and post_id = old.post_id
    and actor_id = old.user_id
    and read = false;
  return old;
end;
$$;

create trigger on_post_like_deleted
  after delete on public.post_likes
  for each row
  execute function public.handle_post_unlike_notification();

-- 2. Post Reposts Trigger Function
create or replace function public.handle_post_repost_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  target_author_id uuid;
begin
  select author_id into target_author_id from public.posts where id = new.post_id;
  if target_author_id is not null and target_author_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (target_author_id, new.user_id, 'repost', new.post_id);
  end if;
  return new;
end;
$$;

create trigger on_post_repost_created
  after insert on public.post_reposts
  for each row
  execute function public.handle_post_repost_notification();

create or replace function public.handle_post_unrepost_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.notifications
  where type = 'repost'
    and post_id = old.post_id
    and actor_id = old.user_id
    and read = false;
  return old;
end;
$$;

create trigger on_post_repost_deleted
  after delete on public.post_reposts
  for each row
  execute function public.handle_post_unrepost_notification();

-- 3. Post Comments Trigger Function
create or replace function public.handle_post_comment_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  target_author_id uuid;
begin
  select author_id into target_author_id from public.posts where id = new.post_id;
  if target_author_id is not null and target_author_id <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (target_author_id, new.author_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

create trigger on_post_comment_created
  after insert on public.post_comments
  for each row
  execute function public.handle_post_comment_notification();

create or replace function public.handle_post_uncomment_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.notifications
  where comment_id = old.id;
  return old;
end;
$$;

create trigger on_post_comment_deleted
  after delete on public.post_comments
  for each row
  execute function public.handle_post_uncomment_notification();

-- 4. Follows Trigger Function
create or replace function public.handle_follow_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.followee_id <> new.follower_id then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.followee_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

create trigger on_follow_created
  after insert on public.follows
  for each row
  execute function public.handle_follow_notification();

create or replace function public.handle_unfollow_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.notifications
  where type = 'follow'
    and recipient_id = old.followee_id
    and actor_id = old.follower_id
    and read = false;
  return old;
end;
$$;

create trigger on_follow_deleted
  after delete on public.follows
  for each row
  execute function public.handle_unfollow_notification();
