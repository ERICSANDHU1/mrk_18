/** Who gets the Founding 500 surfaces (Comrk + Chief) while billing isn't live.
 *
 *  `NEXT_PUBLIC_UNLOCKED_EMAILS` = comma-separated allowlist — your own founder
 *  account, plus any Founding 500 member you onboard by hand. Everyone else
 *  keeps the 🔒 + upgrade modal, so the conversion funnel stays intact.
 *
 *  This function is the shared allowlist check. The /chief and /cowork route
 *  layouts enforce it SERVER-SIDE via requireProAccess (entitlements-server.ts),
 *  so the URL can't be typed past; here it also drives the Rail's 🔒 UI. Replace
 *  the email allowlist with a real per-founder plan flag from the DB once
 *  billing ships — call sites stay the same.
 */
export function hasProAccess(email?: string | null): boolean {
  if (!email) return false;
  const allow = (process.env.NEXT_PUBLIC_UNLOCKED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}
