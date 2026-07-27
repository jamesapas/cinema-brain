-- Cinema Brain: saved conversations with Kino
--
-- Two tables, both private to their owner:
--   chat_conversations - one row per conversation, carrying the title shown in
--                        the history list and the timestamp it is ordered by.
--   chat_messages      - the turns, in order, including the posters an
--                        assistant turn chose to show.
--
-- Messages have no user_id of their own: ownership is the parent conversation's
-- to state, and duplicating it would let the two disagree. The policies below
-- reach up through conversation_id instead.

-- ---------------------------------------------------------------------------
-- chat_conversations
-- ---------------------------------------------------------------------------

create table public.chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  -- Defaulted to the caller so an insert never has to name it; the insert
  -- policy still requires it to match.
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Set from the opening message when the row is created, then rewritten once
  -- the first reply lands and a model can name the exchange. Two steps because
  -- the naming request must never come between the user and their answer — and
  -- if it fails, the row is already titled.
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chat_conversations_title_length check (
    title is null or char_length(btrim(title)) between 1 and 120
  )
);

comment on table public.chat_conversations is 'One saved conversation with Kino. RLS-scoped: a user only ever sees their own.';

-- The history list is "mine, most recently active first", which is this index
-- exactly. updated_at rather than created_at so a revived old chat comes back
-- to the top.
create index chat_conversations_user_recent_idx
  on public.chat_conversations (user_id, updated_at desc);

create trigger chat_conversations_set_updated_at
  before update on public.chat_conversations
  for each row execute function public.set_updated_at();

alter table public.chat_conversations enable row level security;

create policy "chat_conversations_select_own"
  on public.chat_conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_conversations_insert_own"
  on public.chat_conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "chat_conversations_update_own"
  on public.chat_conversations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chat_conversations_delete_own"
  on public.chat_conversations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  role            text not null,
  content         text not null,
  -- The ShownMovie[] the turn's posters were rendered from, stored whole.
  --
  -- Not a join table of movie ids: the cards are a record of what Kino showed
  -- at the time, and rebuilding them later from live catalog rows would quietly
  -- rewrite history when the sync changes a poster or a title. A user turn
  -- carries an empty array.
  movies          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),

  constraint chat_messages_role_valid check (role in ('user', 'assistant')),
  constraint chat_messages_movies_is_array check (jsonb_typeof(movies) = 'array')
);

comment on table public.chat_messages is 'Turns within a conversation. RLS-scoped through the parent conversation.';

-- Replaying a conversation reads every message of one conversation in order.
create index chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_messages enable row level security;

-- No update policy: a turn that has been said is not edited. Deletes happen by
-- cascade when the conversation goes, so they are not granted here either.
create policy "chat_messages_select_own"
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "chat_messages_insert_own"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );
