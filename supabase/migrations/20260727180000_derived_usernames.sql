-- Kino: handles are derived, not asked for
--
-- The signup form no longer has a username box. It was a required field at the
-- moment of highest drop-off, asking people to choose a public name before
-- they had seen the product — and it could not be asked for at all on the
-- Google path, which hands over an email and a picture and nothing else. So
-- the handle is now derived from the email local part on every path, and
-- changed later from the profile page by people who care what theirs is.
--
-- Which makes collisions the trigger's problem rather than the form's. The
-- previous version derived a fallback handle but inserted it unguarded: the
-- second "karl@" to sign up hit the unique index and lost the whole account
-- creation to a database error. This one walks suffixes until a handle is
-- free.

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
begin
  -- Metadata still wins where it exists, so an invite or a seeding script can
  -- name an account. Nothing in the app sends it any more.
  base := regexp_replace(
    lower(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'cinephile'
    )),
    '[^a-z0-9_]', '_', 'g'
  );

  -- Pad a too-short handle rather than reject the account outright.
  while char_length(base) < 3 loop
    base := base || '_';
  end loop;
  base := left(base, 20);

  candidate := base;

  -- Try, then step aside: the exception handler covers both a handle already
  -- taken and two signups racing for the same one, which a "select where not
  -- exists" check ahead of the insert would not.
  --
  -- Every attempt goes through the handler, including the random ones — a
  -- fallback that inserts unguarded is just the original bug moved to a rarer
  -- branch, and the rarer the branch the longer it survives unnoticed.
  for attempt in 1..200 loop
    begin
      insert into public.profiles (id, username)
      values (new.id, candidate)
      on conflict (id) do nothing;

      return new;
    exception when unique_violation then
      suffix := suffix + 1;

      if suffix <= 50 then
        -- Trim the base, not the digits: "karl2" stays inside 20 characters
        -- while still reading as the name they'd recognise.
        candidate := left(base, 20 - char_length(suffix::text)) || suffix::text;
      else
        -- Fifty "karl"s deep, and counting up is no longer worth the round
        -- trips. Draw instead, and keep drawing until one lands.
        candidate := left(base, 13) || floor(random() * 1000000)::text;
      end if;
    end;
  end loop;

  -- 150 consecutive draws from a million all colliding. This should be
  -- unreachable; failing loudly beats inventing a handle nobody can predict.
  raise exception 'handle_new_user: no free username derived from %', base;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row for a new account, deriving a free handle from signup metadata or the email local part.';
