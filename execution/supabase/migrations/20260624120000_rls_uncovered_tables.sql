-- Close the Supabase "rls_disabled_in_public" finding.
--
-- These tables were created OUTSIDE our migrations (the LangGraph Postgres
-- checkpointer makes its tables at runtime; _migrations is bookkeeping), so RLS
-- was never enabled on them — leaving them reachable via Supabase's auto REST
-- API (anon/authenticated), which bypasses our FastAPI backend entirely.
--
-- Why this is safe: the app touches all of these ONLY through the postgres-owner
-- connection (the checkpointer / seed scripts). The table owner BYPASSES RLS, so
-- enabling RLS with no policy blocks just the public REST API — the exact hole.
-- The one exception is experience_chunks, which the app READS as the tenant role,
-- so it gets an explicit read policy.

-- LangGraph checkpointer state (run/thread data) — backend-only.
alter table if exists public.checkpoints          enable row level security;
alter table if exists public.checkpoint_blobs      enable row level security;
alter table if exists public.checkpoint_writes     enable row level security;
alter table if exists public.checkpoint_migrations enable row level security;

-- Migration bookkeeping — metadata only, backend-only.
alter table if exists public._migrations           enable row level security;

-- Shared "Experience Brain" corpus: read by the app as the tenant role (writes
-- happen as the owner, which bypasses RLS). Allow tenant reads; block the REST API.
alter table if exists public.experience_chunks     enable row level security;
drop policy if exists experience_tenant_read on public.experience_chunks;
create policy experience_tenant_read on public.experience_chunks
  for select to mrk18_tenant using (true);
