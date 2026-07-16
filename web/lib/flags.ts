/** Master switch for the live Meta / ad-data connector.
 *
 *  While locked: the connect / sync UI shows a "coming soon" state, and the
 *  server routes refuse to start an OAuth or pull data — so it can't be reached
 *  by hitting the API directly either.
 *
 *  Driven by `NEXT_PUBLIC_CONNECTORS_LOCKED`:
 *    unset / anything else  → LOCKED (safe default — a fresh env stays shut)
 *    "false"                → LIVE
 *
 *  Sequencing note: Meta Advanced Access needs ~500 Marketing API calls in 15
 *  days, which is impossible while this is locked — so it goes live BEFORE App
 *  Review, not after. Until review clears, only accounts holding a role on the
 *  Meta app (admin/developer/tester) can complete the connect; everyone else
 *  gets a Facebook error. Keep it locked in any environment real visitors touch
 *  until review passes.
 */
export const CONNECTORS_LOCKED: boolean = process.env.NEXT_PUBLIC_CONNECTORS_LOCKED !== "false";
