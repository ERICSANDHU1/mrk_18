import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getOnboarding } from "@/lib/server/backend";

/** The signed-in account's DAILY free-chat allowance + chat capabilities. The chat
 *  UI reads this on load for the "N left today" counter, to pop the onboarding /
 *  upgrade modal at the cap, and to enable image upload when vision (Terra) is on.
 *  The backend owns the counter (5/day pre-onboarding, a fresh 10/day after) — this
 *  route just relays it, falling back to the onboarding state only if it's down. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // backend chat-quota is the source of truth (it picks the right tier + counter)
  let quota: Record<string, unknown> | null = null;
  try {
    const q = await backendFetch("/cmo/chat-quota");
    if (q.ok) {
      const j = await q.json();
      const used = Number(j.used) || 0;
      const cap = Number(j.cap) || (j.onboarded ? 10 : 5);
      quota = {
        used,
        cap,
        remaining: Math.max(0, cap - used),
        onboarded: !!j.onboarded,
        limitReached: !!j.limit_reached,
        resets_in: j.resets_in,
      };
    }
  } catch {
    /* fall through to the onboarding-state default below */
  }

  // backend unreachable → a sensible default from the onboarding state
  if (!quota) {
    const onboarded = (await getOnboarding().catch(() => ({ complete: false }))).complete;
    const cap = onboarded ? 10 : 5;
    quota = { used: 0, cap, remaining: cap, onboarded, limitReached: false };
  }

  let vision = false;
  try {
    const c = await backendFetch("/cmo/capabilities");
    if (c.ok) vision = !!(await c.json())?.vision;
  } catch {
    /* no vision → the upload button stays disabled */
  }

  return NextResponse.json({ ...quota, vision });
}
