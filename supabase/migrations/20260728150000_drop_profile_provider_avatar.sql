-- Superseded: the Google picture is now copied into the avatars bucket and
-- referenced through the existing avatar_path column instead of a second,
-- parallel column that could drift out of sync with it.
alter table public.profiles
  drop column provider_avatar_url;
