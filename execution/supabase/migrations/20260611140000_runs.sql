-- Slice 1.3 — campaign runs (RunMeta persistence + INR cost meter)

create table if not exists runs (
    run_id           uuid primary key,
    founder_id       uuid not null references founders(id) on delete cascade,
    thread_id        text not null unique,
    status           text not null default 'generating'
                     check (status in ('generating','awaiting_gate1','generating_content',
                                       'awaiting_gate2','publishing','done','failed')),
    tokens_in        integer not null default 0,
    tokens_out       integer not null default 0,
    images_generated integer not null default 0,
    cost_inr         numeric(12,4) not null default 0,
    report           jsonb,
    gate1            jsonb,
    error            text,
    started_at       timestamptz not null default now(),
    finished_at      timestamptz,
    updated_at       timestamptz not null default now()
);

create index if not exists runs_founder_idx on runs (founder_id, started_at desc);

alter table runs enable row level security;

drop policy if exists tenant_isolation_runs on runs;
create policy tenant_isolation_runs on runs
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
