-- The account's persisted Business DNA — the Studio shared object ("Taste the
-- Brain" feature). One row per signed-in account (auth user id); read by the DNA
-- screen, Talk-to-CMO, and Create Campaigns, never re-derived. Editing updates
-- this single row and propagates to every downstream flow.

create table if not exists brand_dna (
    auth_user_id text primary key,
    payload      jsonb not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists brand_dna_updated_idx on brand_dna (updated_at desc);

-- The backend writes as the postgres owner (bypasses RLS); enabling RLS with no
-- policy blocks the Supabase auto REST surface. View rows in the Table Editor.
alter table brand_dna enable row level security;
