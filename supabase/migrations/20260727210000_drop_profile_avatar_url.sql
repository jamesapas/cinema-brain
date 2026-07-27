-- Cinema Brain: drop profiles.avatar_url
--
-- Google's picture is already sitting in the auth session's own metadata,
-- read straight off `getUser()` — copying it into `profiles` was a second
-- place for the same value to go stale. Every avatar this app renders is the
-- viewer's own, and that's the one case `auth.users` metadata is directly
-- readable for, so there's nothing this column bought. `avatar_path` is
-- unaffected: it's still what an upload overrides the default with.

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
begin
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

  for attempt in 1..200 loop
    begin
      insert into public.profiles (id, username, display_name)
      values (new.id, candidate, name)
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

alter table public.profiles
  drop column avatar_url;
