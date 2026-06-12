-- Slice 2.2 — S3: make RLS actually ENFORCE.
--
-- Until now the app connects as `postgres` (table owner / superuser), which
-- BYPASSES the row-level-security policies defined on every table. This adds a
-- least-privilege role `mrk18_tenant` that does NOT bypass RLS. Data-access
-- paths SET LOCAL ROLE to it + SET app.tenant_id per transaction, so the
-- existing tenant_isolation_* policies finally filter rows at the DB layer —
-- defense that survives an application bug.

do $$
begin
    if not exists (select from pg_roles where rolname = 'mrk18_tenant') then
        create role mrk18_tenant nologin nobypassrls;
    end if;
end $$;

grant usage on schema public to mrk18_tenant;
grant select, insert, update, delete on all tables in schema public to mrk18_tenant;
grant usage, select on all sequences in schema public to mrk18_tenant;
-- let `postgres` assume the role within a transaction (SET LOCAL ROLE)
grant mrk18_tenant to postgres;

-- future tables created by `postgres` automatically grant to the tenant role
alter default privileges for role postgres in schema public
    grant select, insert, update, delete on tables to mrk18_tenant;
alter default privileges for role postgres in schema public
    grant usage, select on sequences to mrk18_tenant;
