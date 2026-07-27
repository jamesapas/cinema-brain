alter table public.profiles
  add column bio text;

alter table public.profiles
  add constraint profiles_bio_length check (
    bio is null or char_length(btrim(bio)) between 1 and 160
  );

comment on column public.profiles.bio is
  'Short one-line bio shown on the profile sidebar. Public, like the rest of the row.';
