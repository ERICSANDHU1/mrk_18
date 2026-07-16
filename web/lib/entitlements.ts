/** Who gets the Founding 500 surfaces (Comrk + Chief) while billing isn't live.
 *
 *  `NEXT_PUBLIC_UNLOCKED_EMAILS` = comma-separated allowlist — your own founder
 *  account, plus any Founding 500 member you onboard by hand. Everyone else
 *  keeps the 🔒 + upgrade modal, so the conversion funnel stays intact.
 *
 *  NOTE: this is a UI affordance, not a security boundary — the /chief and
 *  /cowork pages have no server-side gate, so a signed-in user can still reach
 *  them by typing the URL. Enforce server-side before anything genuinely paid
 *  or sensitive lives behind it. Replace this with a real per-founder plan flag
 *  from the DB once billing ships.
 */
export function hasProAccess(email?: string | null): boolean {
  if (!email) return false;
  const allow = (process.env.NEXT_PUBLIC_UNLOCKED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}
