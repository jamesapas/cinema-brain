-- Kino's read on someone's taste, cached on the profile row.
--
-- Generating it costs a model call, so it is stored rather than derived per
-- render. `taste_summary_key` is a fingerprint of the ratings the summary was
-- written from: when it stops matching the user's current ratings, the summary
-- is stale and the owner's next visit regenerates it. Unchanged ratings never
-- spend anything.

alter table public.profiles
  add column taste_summary text,
  add column taste_summary_key text,
  add column taste_summary_at timestamptz;

comment on column public.profiles.taste_summary is
  'Kino''s one-paragraph read on this user''s taste. Public, like the rest of the row.';

comment on column public.profiles.taste_summary_key is
  'Fingerprint of the (movie_id, rating) set the summary was written from. A mismatch means stale.';

comment on column public.profiles.taste_summary_at is
  'When the cached summary was last generated. Used to debounce a burst of ratings into one call.';
