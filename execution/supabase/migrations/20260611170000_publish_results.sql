-- Slice 1.6 — publish results (one row per item × adapter; deliberately
-- UPDATABLE: the IG ops queue completes asynchronously)

create table if not exists publish_results (
    result_id        uuid primary key,
    request_id       text not null unique,   -- idempotency key: item_id:adapter
    item_id          uuid not null references content_items(item_id) on delete cascade,
    run_id           uuid not null references runs(run_id) on delete cascade,
    founder_id       uuid not null references founders(id) on delete cascade,
    platform         text not null,
    adapter          text not null,
    status           text not null check (status in
                     ('published','queued_manual','exported','retryable','failed')),
    platform_post_id text,
    public_url       text,
    thread_ids       jsonb,
    payload          jsonb not null default '{}'::jsonb,  -- request snapshot (ops + audit)
    raw_response     jsonb not null default '{}'::jsonb,
    error            text,
    cost_estimate_usd numeric(10,5),
    published_at     timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists publish_results_run_idx on publish_results (run_id);
create index if not exists publish_results_status_idx on publish_results (status, created_at);

alter table publish_results enable row level security;

drop policy if exists tenant_isolation_publish on publish_results;
create policy tenant_isolation_publish on publish_results
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
