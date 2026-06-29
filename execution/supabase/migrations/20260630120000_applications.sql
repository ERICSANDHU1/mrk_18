-- Founding-50 waitlist applications from the public landing form (no founder).

create table if not exists applications (
    id              uuid primary key,
    email           text not null,
    phone           text,
    company         text,
    marketing_issue text not null,
    created_at      timestamptz not null default now()
);

create index if not exists applications_created_idx on applications (created_at desc);

-- The backend writes as the postgres owner (bypasses RLS); enabling RLS with no
-- policy blocks the Supabase auto REST surface. View rows in the Table Editor.
alter table applications enable row level security;
