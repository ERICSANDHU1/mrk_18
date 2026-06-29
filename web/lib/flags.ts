/** Master switch for the live Meta / ad-data connector.
 *
 *  Locked until the Meta app clears App Review and we're ready to let founders
 *  connect their own ad accounts. While locked: the connect / sync UI shows a
 *  "coming soon" state, and the server routes refuse to start an OAuth or pull
 *  data — so it can't be reached by hitting the API directly either.
 *
 *  Flip to `false` to go live. */
export const CONNECTORS_LOCKED: boolean = true;
