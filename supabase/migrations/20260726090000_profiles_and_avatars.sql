-- Cinema Brain: user profiles + avatar storage
--
-- auth.users belongs to Supabase Auth and is not ours to extend, so anything
-- the app knows about a person lives here, keyed one-to-one to that table.
--
-- Storage: a public `avatars` bucket. Public because the object URL is then
-- stable and cacheable by next/image with no signing round trip per render;
-- the path carries a random uuid, so knowing someone's user id is not enough
-- to derive it. Writes are still owner-only, enforced on storage.objects.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  -- Same id as the auth user: one row per account, and the cascade means
  -- deleting the account takes the profile with it.
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Object path inside the avatars bucket, e.g. "<uid>/<uuid>.jpg". The path
  -- rather than a full URL, so the bucket or CDN host can change without a
  -- rewrite of every row.
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 40
  ),
  -- The path must sit under the owner's own folder; the storage policies
  -- assume it and this keeps a stray value from pointing somewhere else.
  constraint profiles_avatar_path_owned check (
    avatar_path is null or avatar_path like (id::text || '/%')
  )
);

comment on table public.profiles is 'Per-user profile. RLS-scoped: a user only ever sees and edits their own row.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- No insert policy: rows are created by the signup trigger below, never by the
-- client. A user can read and update their own row and nothing else.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- profile row per account
-- ---------------------------------------------------------------------------

-- security definer so it can write a table the new user cannot yet insert
-- into; search_path is pinned for the same reason as set_updated_at.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that predate this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- avatars bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB; the uploader downscales to 512px before it ever gets here.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The bucket is readable by anyone holding the URL; writes are owner-only, and
-- ownership is the first path segment. Reads are not policed here because a
-- public bucket serves objects without consulting storage.objects at all.
create policy "avatars_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Listing a folder goes through select on storage.objects even for a public
-- bucket, and the uploader lists its own folder to clean up old files.
create policy "avatars_select_own_folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
