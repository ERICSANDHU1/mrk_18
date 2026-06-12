-- Slice 1.5 — Gate 2: approval events + run gate2 state

alter table runs add column if not exists gate2 jsonb;

create table if not exists approval_events (
    event_id   uuid primary key,
    run_id     uuid not null references runs(run_id) on delete cascade,
    item_id    uuid not null references content_items(item_id) on delete cascade,
    founder_id uuid not null references founders(id) on delete cascade,
    decision   text not null check (decision in ('approved','rejected')),
    note       text,
    signature  text,
    decided_at timestamptz not null default now()
);

create index if not exists approval_events_item_idx on approval_events (item_id, decided_at desc);
create index if not exists approval_events_run_idx on approval_events (run_id);

-- Approval events are evidence: append-only, same as the audit log.
drop trigger if exists approval_events_no_mutation on approval_events;
create trigger approval_events_no_mutation
    before update or delete on approval_events
    for each row execute function audit_log_block_mutation();

alter table approval_events enable row level security;

drop policy if exists tenant_isolation_approvals on approval_events;
create policy tenant_isolation_approvals on approval_events
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
