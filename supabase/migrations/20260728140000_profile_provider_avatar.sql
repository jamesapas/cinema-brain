-- The Google picture lives only in auth.users.user_metadata, which no other
-- user can ever read. Caching it on the public profile row is what makes a
-- visitor's avatar actually show up. Refreshed at each sign-in; an uploaded
-- avatar_path still wins over this in the app's avatarUrl() ordering.
alter table public.profiles
  add column provider_avatar_url text;

comment on column public.profiles.provider_avatar_url is
  'Cached OAuth provider picture (e.g. Google), refreshed at sign-in. Public, like the rest of the row.';

update public.profiles p
set provider_avatar_url = coalesce(
  u.raw_user_meta_data ->> 'avatar_url',
  u.raw_user_meta_data ->> 'picture'
)
from auth.users u
where u.id = p.id
  and coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') is not null;
