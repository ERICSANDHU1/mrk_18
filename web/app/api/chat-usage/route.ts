import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getOnboarding } from "@/lib/server/backend";

/** The signed-in account's DAILY free-chat allowance + chat capabilities. The chat
 *  UI reads this on load for the "N left today" counter, to pop the onboarding /
 *  upgrade modal when capped, and to enable image upload when vision (Terra) is on.
 *  The daily cap itself lives in the backend — this route just relays it. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const onboarding = await getOnboarding();
  const onboarded = onboarding.complete;

  let quota: Record<string, unknown> = {
    used: 0,
    cap: onboarded ? 15 : 5,
    remaining: onboarded ? 15 : 5,
    onboarded,
    limitReached: false,
  };
  try {
    const q = await backendFetch("/cmo/chat-quota");
    if (q.ok) {
      const j = await q.json();
      const backendOnboarded = !!j.onboarded || onboarded;
      const cap = backendOnboarded ? Math.max(Number(j.cap) || 0, 15) : Number(j.cap) || 5;
      const used = Number(j.used) || 0;
      quota = {
        used,
        cap,
        remaining: Math.max(0, cap - used),
        onboarded: backendOnboarded,
        limitReached: !!j.limit_reached,
        resets_in: j.resets_in,
      };
    } else if (onboarded) {
      quota = {
        used: 0,
        cap: 15,
        remaining: 15,
        onboarded: true,
        limitReached: false,
      };
    }
  } catch {
    if (onboarded) {
      quota = {
        used: 0,
        cap: 15,
        remaining: 15,
        onboarded: true,
        limitReached: false,
      };
    }
    /* backend down → default allowance; the turn itself will surface any error */
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
