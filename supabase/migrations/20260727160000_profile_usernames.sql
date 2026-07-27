-- Cinema Brain: usernames
--
-- An account now has a handle as well as an email, and either one gets you in.
-- The email stays the identity Supabase Auth knows about — it is what the
-- password check is made against — so the username lives here on the profile
-- and is resolved to an email before sign-in. That keeps auth.users untouched
-- and means a username can change later without touching credentials.
--
-- Required and unique, case-insensitively: it is an identifier people type at
-- a login box, so "James" and "james" cannot be two different accounts.

alter table public.profiles
  add column username text;

-- ---------------------------------------------------------------------------
-- backfill, before the not-null lands
-- ---------------------------------------------------------------------------

-- The email local part is the obvious handle for accounts that predate this,
-- with the characters the format check rejects folded to underscores and a
-- numeric suffix if two accounts collide.
with seeded as (
  select
    u.id,
    regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '_', 'g') as base,
    row_number() over (
      partition by regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '_', 'g')
      order by u.created_at
    ) as nth
  from auth.users u
)
update public.profiles p
set username = case
  when seeded.nth = 1 then seeded.base
  else seeded.base || seeded.nth::text
end
from seeded
where seeded.id = p.id
  and p.username is null;

-- The one handle that was asked for by name.
update public.profiles
set username = 'james'
where id = (select id from auth.users where email = 'apasjameskarl@gmail.com');

-- ---------------------------------------------------------------------------
-- shape and uniqueness
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column username set not null;

-- Stored lowercase rather than merely compared that way: one canonical form
-- means the column can be looked up directly and displayed without surprises.
alter table public.profiles
  add constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_]{3,20}$'
  );

create unique index profiles_username_key on public.profiles (username);

comment on column public.profiles.username is
  'Unique lowercase handle. Doubles as a login identifier, resolved to the account email server-side.';

-- ---------------------------------------------------------------------------
-- signup
-- ---------------------------------------------------------------------------

-- The username arrives as signup metadata, since the profile row does not
-- exist yet at the moment the account is created. Falling back to the email
-- local part keeps accounts made outside the app's own form (an invite, the
-- dashboard) from failing the not-null.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  candidate := regexp_replace(
    lower(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      split_part(new.email, '@', 1)
    )),
    '[^a-z0-9_]', '_', 'g'
  );

  -- Pad a too-short handle rather than reject the account outright.
  while char_length(candidate) < 3 loop
    candidate := candidate || '_';
  end loop;
  candidate := left(candidate, 20);

  insert into public.profiles (id, username)
  values (new.id, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------

-- The signup form asks before it submits, so a taken handle is an inline
-- message rather than a failed account creation. security definer because
-- profiles are readable only by their owner, and this deliberately answers
-- for rows the caller cannot see — it returns a boolean and nothing else, so
-- it reveals only what trying to sign up would reveal anyway.
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    lower(btrim(candidate)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles
      where username = lower(btrim(candidate))
    );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
