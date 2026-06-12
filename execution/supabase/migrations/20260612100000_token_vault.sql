-- Slice 2.1 — S2: token vault (connected platform accounts) + OAuth PKCE states
-- Tokens are stored ONLY as envelope-encrypted ciphertext: a per-record data
-- key encrypts the token; the master key (TOKEN_VAULT_KEY, outside the DB)
-- wraps the data key. A full database leak yields gibberish.

create table if not exists connected_accounts (
    account_id        uuid primary key,
    founder_id        uuid not null references founders(id) on delete cascade,
    platform          text not null check (platform in ('linkedin','x','instagram')),
    status            text not null default 'connected'
                      check (status in ('connected','revoked','expired')),
    scopes            jsonb not null default '[]'::jsonb,
    external_ref      text,                       -- platform-side id (URN / handle)
    wrapped_dek       text,                       -- data key, wrapped by master key
    token_ciphertext  text,                       -- access token, encrypted by DEK
    refresh_ciphertext text,                      -- refresh token (if any), encrypted
    token_expires_at  timestamptz,                -- LinkedIn: 60-day lifecycle
    connected_at      timestamptz not null default now(),
    revoked_at        timestamptz,
    updated_at        timestamptz not null default now(),
    unique (founder_id, platform)
);

alter table connected_accounts enable row level security;

drop policy if exists tenant_isolation_accounts on connected_accounts;
create policy tenant_isolation_accounts on connected_accounts
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);

-- Short-lived PKCE handshake state (one row per in-flight OAuth connect).
create table if not exists oauth_states (
    state         text primary key,
    founder_id    uuid not null references founders(id) on delete cascade,
    platform      text not null check (platform in ('linkedin','x','instagram')),
    code_verifier text not null,
    created_at    timestamptz not null default now(),
    expires_at    timestamptz not null
);

alter table oauth_states enable row level security;

drop policy if exists tenant_isolation_oauth_states on oauth_states;
create policy tenant_isolation_oauth_states on oauth_states
    for all
    using (founder_id = current_setting('app.tenant_id', true)::uuid)
    with check (founder_id = current_setting('app.tenant_id', true)::uuid);
