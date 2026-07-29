-- Add trending rank from TMDB's /trending/movie/day endpoint.
--
-- trending_rank is the movie's position in TMDB's daily trending list (1 = #1).
-- NULL for movies not currently trending. Only ~40 rows carry a rank at any
-- time, so the partial index is essentially free.
--
-- trending_at records when the rank was last written so stale data is visible.

alter table public.movies
  add column trending_rank smallint,
  add column trending_at   timestamptz;

-- The homepage query orders by trending_rank ASC NULLS LAST. A partial index
-- on the ~40 non-null rows makes that a tiny index-only scan.
create index movies_trending_rank_idx
  on public.movies (trending_rank asc)
  where trending_rank is not null;

comment on column public.movies.trending_rank is 'Position in TMDB''s daily trending list (1 = top). NULL when not trending.';
comment on column public.movies.trending_at is 'When trending_rank was last written by the sync job.';
