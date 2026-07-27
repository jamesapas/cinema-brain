-- Open the catalog to signed-out visitors.
--
-- Browsing is now the front door: you can see films, open a film page, and
-- search titles without an account. Only the personal parts — ratings,
-- profiles, and chats with Kino — still require one, and those are separate
-- tables whose policies are untouched and remain `to authenticated`.
--
-- `movies` is public data from TMDB; nothing in it is per-user. Writes stay
-- with the service role, which bypasses RLS, so there is still no
-- insert/update/delete policy for anyone.

-- The old policy named `authenticated` only. Replace it with one covering both
-- roles rather than adding a second, so there is one rule to read.
drop policy if exists "movies_select_authenticated" on public.movies;

create policy "movies_select_public"
  on public.movies
  for select
  to anon, authenticated
  using (true);
