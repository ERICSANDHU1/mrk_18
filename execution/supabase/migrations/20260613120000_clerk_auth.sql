-- Accept Clerk (and any OIDC) string subjects — not just Supabase UUIDs.
-- Clerk's JWT `sub` is "user_xxx", not a UUID; widen the identity column to
-- text so a Clerk-authenticated founder can be linked. The unique constraint
-- is preserved across the type change.

alter table founders
    alter column auth_user_id type text using auth_user_id::text;

comment on column founders.auth_user_id is
    'OIDC subject (Supabase auth.users.id UUID, or Clerk user id) — the verified identity that owns this founder';
