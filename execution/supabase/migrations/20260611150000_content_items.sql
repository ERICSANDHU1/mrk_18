-- Slice 1.4 — content items (one row per generated post)

create table if not exists content_items (
    item_id            uuid primary key,
    run_id             uuid not null references runs(run_id) on delete cascade,
    founder_id         uuid not null references founders(id) on delete cascade,
    platform           text not null check (platform in ('linkedin','x','instagram')),
    format             text not null check (format in
                       ('linkedin_post','x_single','x_thread','ig_caption')),
    body               text not null,
    thread             jsonb,
    link_url           text,
    first_comment      text,
    image_prompt       text,
    media              jsonb not null default '[]'::jsonb,
    status             text not null default 'draft'
                       check (status in ('draft','awaiting_approval','approved','rejected',
                                         'expired','published','exported','failed')),
    regeneration_note  text,
    regeneration_count integer not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists content_items_run_idx on content_items (run_id);
create index if not exists content_items_founder_idx on content_items (founder_id, created_at desc);

alter table content_items enable row level security;

drop policy if exists tenant_isolation_content on content_items;
create policy tenant_isolation_content on content_items
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
