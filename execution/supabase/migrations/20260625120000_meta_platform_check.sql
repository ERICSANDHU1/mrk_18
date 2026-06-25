-- Allow the 'meta' platform on connected_accounts + oauth_states.
--
-- The original token-vault migration pinned `platform in ('linkedin','x',
-- 'instagram')` as an inline CHECK on BOTH tables. The Meta ad-data connector
-- inserts platform='meta' (oauth_states on connect-start, connected_accounts on
-- token store), which would fail the CHECK on real Postgres. The ORM column is a
-- plain String, so SQLite tests don't catch this — classic model-vs-migration
-- drift. This widens both constraints to include 'meta'.
--
-- Robust + idempotent: drop whatever platform CHECK currently exists (matched by
-- its definition, so the auto-generated name doesn't matter), then add the new
-- inclusive one with a known name.

do $$
declare c record;
begin
  for c in
    select rel.relname as tbl, con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname in ('connected_accounts', 'oauth_states')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%platform%'
      and pg_get_constraintdef(con.oid) ilike '%linkedin%'
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.name);
  end loop;
end $$;

alter table public.connected_accounts
  add constraint connected_accounts_platform_check
  check (platform in ('linkedin', 'x', 'instagram', 'meta'));

alter table public.oauth_states
  add constraint oauth_states_platform_check
  check (platform in ('linkedin', 'x', 'instagram', 'meta'));
