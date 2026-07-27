-- Cinema Brain: display name from Google
--
-- Google's grant hands over a name and a picture. The picture stays unused —
-- the initials avatar is the default for every account regardless of how it
-- signed up, and fetching a copy of someone's Google photo to re-host would
-- earn nothing. The name is worth keeping: it beats the email-derived handle
-- as a first display name, so the signup trigger saves it when the provider
-- hands one over. Username derivation is untouched — it already falls back
-- to the email local part, which the Google grant has too.

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
  base := regexp_replace(
    lower(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'cinephile'
    )),
    '[^a-z0-9_]', '_', 'g'
  );

  while char_length(base) < 3 loop
    base := base || '_';
  end loop;
  base := left(base, 20);

  candidate := base;

  -- Google puts the account's name under one of these keys depending on API
  -- version; a plain email/password signup has neither, and null leaves
  -- display_name to fall back to the email-derived name it always had.
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
