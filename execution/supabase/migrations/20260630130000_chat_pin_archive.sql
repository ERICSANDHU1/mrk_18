-- Pin / archive controls for the Chat tab's Recents menu.

alter table chat_sessions add column if not exists pinned   boolean not null default false;
alter table chat_sessions add column if not exists archived boolean not null default false;

-- the Recents list orders pinned-first, newest-updated, with archived filtered out
create index if not exists chat_sessions_recents_idx
  on chat_sessions (founder_id, archived, pinned desc, updated_at desc);
