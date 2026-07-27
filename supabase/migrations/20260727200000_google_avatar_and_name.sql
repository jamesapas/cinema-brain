-- Cinema Brain: Google avatar as the default, name as the handle
--
-- Reversing the earlier call: the Google avatar is now the default picture
-- rather than the initials placeholder, and the handle is derived from the
-- Google name rather than the email local part. Both stay overridable —
-- uploading a picture or changing the handle from the profile page still
-- wins, this only changes what a fresh Google signup starts with.

alter table public.profiles
  add column avatar_url text;

comment on column public.profiles.avatar_url is
  'External avatar from an OAuth provider (Google). Only shown when avatar_path is unset — an upload always wins.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix int := 1;
  name text;
  picture text;
begin
  -- Metadata username still wins where it exists (an invite, a seeding
  -- script). After that, the account's name — Google's grant included —
  -- beats the email local part as something a person would recognise.
  base := trim(both '_' from regexp_replace(
    lower(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'cinephile'
    )),
    '[^a-z0-9]+', '_', 'g'
  ));

  while char_length(base) < 3 loop
    base := base || '_';
  end loop;
  base := left(base, 20);

  candidate := base;

  name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )), '');
  if name is not null then
    name := left(name, 40);
  end if;

  picture := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  )), '');

  for attempt in 1..200 loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (new.id, candidate, name, picture)
      on conflict (id) do nothing;

      return new;
    exception when unique_violation then
      suffix := suffix + 1;

      if suffix <= 50 then
        candidate := left(base, 20 - char_length(suffix::text)) || suffix::text;
      else
        candidate := left(base, 13) || floor(random() * 1000000)::text;
      end if;
    end;
  end loop;

  raise exception 'handle_new_user: no free username derived from %', base;
end;
$$;

-- ---------------------------------------------------------------------------
-- the one account that signed up through Google before this migration
-- ---------------------------------------------------------------------------

update public.profiles
set avatar_url = 'https://lh3.googleusercontent.com/a/ACg8ocI3PvrY4a-gMs6vWeO_VbopFCOld7_DfQ7U1lvhCQn95Gc1t6XGEQ=s96-c',
    username = 'karl_apas'
where id = (select id from auth.users where email = 'jameskarlapas123@gmail.com');
