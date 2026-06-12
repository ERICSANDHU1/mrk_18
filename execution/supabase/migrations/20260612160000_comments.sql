-- Slice 3.4 — Comment Agent: comments on published posts + drafted replies.
--
-- One row per comment (deduped by item × platform-comment-id). The agent
-- scores sentiment (free, deterministic) and drafts a reply; reply_status
-- starts at 'new' and ONLY the founder moves it to approved. No auto-reply
-- exists at the data level — the same human-in-command rule as Gate 2.
-- Tenant-isolated like every founder table.

create table if not exists post_comments (
    comment_id     uuid primary key,
    founder_id     uuid not null references founders(id) on delete cascade,
    item_id        uuid not null references content_items(item_id) on delete cascade,
    platform       text not null,
    external_id    text not null,          -- the platform's own comment id
    source         text not null default 'manual',
    author_handle  text,
    text           text not null,
    sentiment      numeric(4,3) check (sentiment is null or sentiment between -1 and 1),
    reply_draft    text,
    reply_status   text not null default 'new' check (reply_status in
                   ('new','reply_drafted','reply_approved','reply_published',
                    'reply_rejected','ignored')),
    reply_note     text,
    redraft_count  integer not null default 0,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (item_id, external_id)
);

create index if not exists post_comments_item_idx on post_comments (item_id, reply_status);
create index if not exists post_comments_founder_idx on post_comments (founder_id, created_at);

alter table post_comments enable row level security;

drop policy if exists tenant_isolation_comments on post_comments;
create policy tenant_isolation_comments on post_comments
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
