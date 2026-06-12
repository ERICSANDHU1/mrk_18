-- S1 auth hardening (perimeter work pulled ahead of Slice 2.4):
-- bind founders to Supabase Auth identities.
--
-- The API now refuses founder-scoped requests that do not carry a verified
-- Supabase JWT (asymmetric, validated against the project JWKS — never the
-- legacy HS256 shared secret). The token's `sub` (auth.users.id) maps to
-- exactly one founder via this column; every endpoint compares the verified
-- identity against the resource owner server-side. The dashboard is a window,
-- not a wall — this is the wall.
--
-- NULL auth_user_id = legacy/demo founder: unreachable through the API until
-- re-linked (fail closed, never open).

alter table founders add column if not exists auth_user_id uuid unique;

comment on column founders.auth_user_id is
    'Supabase auth.users.id (JWT sub) — the verified identity that owns this founder';
