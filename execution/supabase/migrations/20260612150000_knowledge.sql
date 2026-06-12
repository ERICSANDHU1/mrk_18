-- Slice 3.3 — Company Brain corpus (FREE-TIER edition).
--
-- Deliberate MVP choices, made for the 500 MB free tier:
--   * embeddings stored as JSONB (portable, no extension dependency);
--     similarity is exact cosine computed in the app — at the MVP cap
--     (~1.5k chunks/founder) brute force is milliseconds with PERFECT recall
--   * NO HNSW index — it exists to search millions of vectors; we don't
--     have millions, so we don't pay its RAM + storage tax
--   * hard per-founder chunk cap enforced at ingestion (config), refused
--     honestly, never silently truncated
--
-- THE PRO UPGRADE PATH (run when the corpus outgrows MVP — no re-embedding,
-- no code change to retrieval callers):
--   create extension if not exists vector;
--   alter table knowledge_chunks add column embedding_vec vector(1024);
--   update knowledge_chunks set embedding_vec = embedding::text::vector;
--   create index knowledge_hnsw on knowledge_chunks
--       using hnsw (embedding_vec vector_cosine_ops);
--   -- then flip rag/store.retrieve to the SQL path and drop the JSON column.

create table if not exists knowledge_chunks (
    chunk_id        uuid primary key,
    founder_id      uuid not null references founders(id) on delete cascade,
    source          text not null,          -- doc:<name> | url:<host> | insight:<tag>
    seq             integer not null default 0,
    content         text not null,
    embedding       jsonb not null,
    embedding_model text not null,
    created_at      timestamptz not null default now(),
    unique (founder_id, source, seq)
);

create index if not exists knowledge_founder_idx on knowledge_chunks (founder_id, source);

alter table knowledge_chunks enable row level security;

drop policy if exists tenant_isolation_knowledge on knowledge_chunks;
create policy tenant_isolation_knowledge on knowledge_chunks
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
