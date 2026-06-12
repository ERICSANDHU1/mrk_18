-- Slice 2.4 — tamper-evident audit log: hash-chained rows.
--
-- The append-only trigger stops the APP from rewriting history; the chain
-- makes rewriting history DETECTABLE even for someone with direct DB access:
-- every row carries row_hash = sha256(prev_hash + canonical content), linked
-- to the previous row in its scope. Edit or remove any historical row and
-- every later hash in that scope stops verifying.
--
-- Chains are PER SCOPE (one per founder + one global for system events with
-- founder_id NULL) because audit writes happen under the RLS tenant role,
-- which can only see its own founder's rows — a single global chain could
-- not even be read at write time.
--
-- Rows written before this migration have NULL hashes: honest legacy,
-- reported as "unchained" by verification, never retro-faked.
--
-- DPDP erasure no longer DELETES a founder's audit rows (that would be
-- indistinguishable from tampering) — it REDACTS them in place: PII fields
-- blanked, redacted=true, hashes untouched, chain intact.

alter table audit_log add column if not exists prev_hash text;
alter table audit_log add column if not exists row_hash text;
alter table audit_log add column if not exists redacted boolean not null default false;

comment on column audit_log.prev_hash is 'row_hash of the previous row in this scope (founder or global); genesis sentinel for the first';
comment on column audit_log.row_hash is 'sha256(prev_hash + canonical row content) — the tamper-evident link';
comment on column audit_log.redacted is 'DPDP-erased content (blanked in place); hashes preserved so the chain survives erasure';
