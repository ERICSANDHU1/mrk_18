-- Analytics Interpreter — stored ad-performance snapshots + the analytics
-- adapter's diagnosis, so the dashboard (Leaks / Channels / Funnel) can read the
-- latest read on the founder's account.
--
-- Source-agnostic by design: `source` = manual | csv | meta | google | ... — the
-- row and every downstream screen are identical whether the metrics arrived by a
-- founder paste today or a live Meta/Google connector later. Wiring the real-time
-- connector only changes WHO writes this row, never its shape.

create table if not exists analytics_diagnoses (
    diagnosis_id  uuid primary key,
    founder_id    uuid not null references founders(id) on delete cascade,
    source        text not null default 'manual',   -- manual | csv | meta | google | ...
    period        text,                              -- e.g. "last 30 days"
    metrics       jsonb not null,                    -- the raw metrics in
    diagnosis     jsonb not null,                    -- the AdDiagnosis out
    created_at    timestamptz not null default now()
);

create index if not exists analytics_founder_idx on analytics_diagnoses (founder_id, created_at desc);

-- Explicit tenant grant (don't rely on ALTER DEFAULT PRIVILEGES timing): the app
-- reads/writes this table as the mrk18_tenant role, scoped by the RLS policy below.
grant select, insert, update, delete on analytics_diagnoses to mrk18_tenant;

alter table analytics_diagnoses enable row level security;

drop policy if exists tenant_isolation_analytics on analytics_diagnoses;
create policy tenant_isolation_analytics on analytics_diagnoses
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
