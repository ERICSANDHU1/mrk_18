-- Chat sessions — the founder's saved conversations with their CMO (the Chat tab
-- "Recents"). One row per conversation; the full message list is stored as JSON
-- and re-saved each turn. Titled from the founder's first message.

create table if not exists chat_sessions (
    id          uuid primary key,
    founder_id  uuid not null references founders(id) on delete cascade,
    title       text not null default 'New chat',
    messages    jsonb not null default '[]'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists chat_sessions_founder_idx
    on chat_sessions (founder_id, updated_at desc);

-- RLS: the FastAPI backend reaches this table only through the postgres-owner
-- connection (which BYPASSES RLS), so enabling RLS with a tenant policy blocks
-- just the Supabase auto REST API (anon/authenticated) — closing the same hole
-- as 20260624120000_rls_uncovered_tables. The policy also future-proofs any
-- tenant-role access (founder_id must equal the bound app.tenant_id).
alter table chat_sessions enable row level security;

drop policy if exists tenant_isolation_chat_sessions on chat_sessions;
create policy tenant_isolation_chat_sessions on chat_sessions
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
