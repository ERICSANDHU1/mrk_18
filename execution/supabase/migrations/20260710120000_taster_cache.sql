-- Free-taster per-domain result cache (public /taster; no founder/tenant).
-- One row per analyzed domain; the backend refreshes rows older than the TTL,
-- so repeat/refresh hits never re-burn Tavily credits or GPU seconds.

create table if not exists taster_cache (
    domain     text primary key,
    payload    jsonb not null,
    fetched_at timestamptz not null default now()
);

create index if not exists taster_cache_fetched_idx on taster_cache (fetched_at desc);

-- The backend writes as the postgres owner (bypasses RLS); enabling RLS with no
-- policy blocks the Supabase auto REST surface. View rows in the Table Editor.
alter table taster_cache enable row level security;
