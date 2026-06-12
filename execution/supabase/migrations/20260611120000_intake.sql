-- Slice 1.2 — Intake layer: founders, founder_profiles, audit_log
-- Rules encoded here:
--   * founder_profiles.status can only be 'draft' or 'ready_for_analysis'
--   * audit_log is append-only (trigger blocks UPDATE/DELETE at the DB level)
--   * RLS enabled on every table from table #1 (defense-in-depth; the
--     dedicated least-privilege app role arrives in Phase 2 — until then the
--     service connection bypasses these policies but they are live and tested)

create table if not exists founders (
    id           uuid primary key default gen_random_uuid(),
    email        text not null unique,
    display_name text,
    created_at   timestamptz not null default now()
);

create table if not exists founder_profiles (
    founder_id uuid primary key references founders(id) on delete cascade,
    status     text not null default 'draft'
               check (status in ('draft', 'ready_for_analysis')),
    draft      jsonb not null default '{}'::jsonb,
    profile    jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists audit_log (
    id                bigint generated always as identity primary key,
    record_id         uuid not null unique,
    event_type        text not null,
    agent_id          text not null,
    founder_id        uuid,
    run_id            uuid,
    approval_event_id uuid,
    platform          text,
    outcome           text not null,
    detail            jsonb not null default '{}'::jsonb,
    created_at        timestamptz not null default now()
);

create index if not exists audit_log_founder_idx on audit_log (founder_id, created_at);

-- Append-only: any UPDATE or DELETE on audit_log fails loudly.
create or replace function audit_log_block_mutation() returns trigger
language plpgsql as $$
begin
    raise exception 'audit_log is append-only (S5 invariant)';
end;
$$;

drop trigger if exists audit_log_no_mutation on audit_log;
create trigger audit_log_no_mutation
    before update or delete on audit_log
    for each row execute function audit_log_block_mutation();

-- Row-Level Security from day one.
alter table founders enable row level security;
alter table founder_profiles enable row level security;
alter table audit_log enable row level security;

drop policy if exists tenant_isolation_founders on founders;
create policy tenant_isolation_founders on founders
    for all
    using (id = current_setting('app.tenant_id', true)::uuid)
    with check (id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists tenant_isolation_profiles on founder_profiles;
create policy tenant_isolation_profiles on founder_profiles
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);

-- Audit log: anyone (with table access) may insert; nobody may read across
-- tenants without tenant context; mutation is blocked by the trigger above.
drop policy if exists audit_insert on audit_log;
create policy audit_insert on audit_log for insert with check (true);

drop policy if exists audit_read_own on audit_log;
create policy audit_read_own on audit_log
    for select
    using (founder_id is null or founder_id = current_setting('app.tenant_id', true)::uuid);
