-- Ratings are shown on a public profile page now, not just the owner's own
-- dashboard. Notes stay out of the app's public query, but the row-level
-- read matches the pattern already used for movies/profiles/follows.
drop policy if exists "user_movie_ratings_select_own" on public.user_movie_ratings;

create policy "user_movie_ratings_select_public"
  on public.user_movie_ratings
  for select
  to anon, authenticated
  using (true);
