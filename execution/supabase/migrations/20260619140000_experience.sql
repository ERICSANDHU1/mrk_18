-- RAG roadmap (Tier 1/2) — the shared "Experience Brain".
--
-- Curated Indian campaign case studies + benchmarks that EVERY founder's
-- analysis retrieves from — the "20 years of real cases" layer that pairs with
-- the trained adapters (voice) and the founder's own Company Brain (their docs).
--
-- Deliberately SHARED, not tenant-scoped:
--   * no founder_id, NO row-level security — this is system knowledge, the same
--     for every founder; it is seeded by an operator script, never written by a
--     founder request (read-only to tenants).
--   * same free-tier storage as the Company Brain: BGE-M3 embedding in a JSON
--     column, exact cosine in the app. At Tier-1 scale (tens-to-hundreds of
--     cases) brute force is milliseconds with perfect recall.
--   * one case = one chunk (the roadmap rule); rich metadata lets retrieval
--     filter to relevant cases (a skincare founder gets skincare cases).
--
-- PRO UPGRADE PATH (only when the corpus reaches thousands of cases): same as
-- knowledge_chunks — add a pgvector column + HNSW index and flip retrieve() to
-- the SQL path. No re-embedding, no caller change. Qdrant only beyond that.

create table if not exists experience_chunks (
    experience_id   uuid primary key,
    ref             text not null unique,        -- e.g. case_0042 — idempotent re-seed
    kind            text not null,               -- campaign_case | benchmark | playbook | framework
    category        text,                        -- "D2C skincare"
    stage           text,                        -- "scaling past ₹50L/month"
    budget_band     text,                        -- "₹2-5L/month"
    channels        jsonb,                       -- ["Meta ads", "WhatsApp"]
    title           text not null,
    content         text not null,               -- full narrative (embedded)
    lesson          text,
    metrics         jsonb,
    provenance      text,                        -- internal | public | reconstructed
    embedding       jsonb not null,
    embedding_model text not null,
    created_at      timestamptz not null default now()
);

create index if not exists experience_category_idx on experience_chunks (category);
create index if not exists experience_kind_idx on experience_chunks (kind);

-- No RLS: shared, read-only system knowledge. Writes happen only via the
-- operator seed script running with the service role.
