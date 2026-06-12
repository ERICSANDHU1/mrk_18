-- Slice 3.1 — Eagle-View: the signals table.
--
-- Mirrors the SignalRecord contract frozen in Slice 1.1 (the whole point of
-- defining it early: Phase 3 lands without a breaking migration). One row per
-- item × platform × window; re-entry UPDATES (founders correct pasted
-- numbers), the latest value wins. Tenant-isolated like every founder table.

create table if not exists signals (
    signal_id          uuid primary key,
    founder_id         uuid not null references founders(id) on delete cascade,
    item_id            uuid not null references content_items(item_id) on delete cascade,
    platform           text not null,
    window_point       text not null check (window_point in ('1h','6h','24h','72h','7d')),
    source             text not null default 'manual',  -- manual | stub | linkedin_api | x_api
    pulled_at          timestamptz not null default now(),
    reach              integer not null default 0 check (reach >= 0),
    engagement_rate    numeric(10,6) not null default 0 check (engagement_rate >= 0),
    follower_delta_48h integer,
    link_ctr           numeric(10,6) check (link_ctr is null or link_ctr >= 0),
    comment_sentiment  numeric(4,3) check (comment_sentiment is null
                                           or comment_sentiment between -1 and 1),
    saves              integer check (saves is null or saves >= 0),
    half_life_hours    numeric(8,2) check (half_life_hours is null or half_life_hours > 0),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    unique (item_id, platform, window_point)
);

create index if not exists signals_founder_idx on signals (founder_id, pulled_at);
create index if not exists signals_item_idx on signals (item_id);

alter table signals enable row level security;

drop policy if exists tenant_isolation_signals on signals;
create policy tenant_isolation_signals on signals
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
