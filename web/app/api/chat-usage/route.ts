import { NextResponse } from "next/server";
import { readChatQuota } from "@/lib/server/chat-quota";

/** The signed-in account's free-chat quota — the chat UI reads this on load to
 *  show the counter and pop the onboarding / upgrade modal at the limit. */
export async function GET() {
  const q = await readChatQuota();
  if (!q) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({
    used: q.used,
    cap: q.cap,
    remaining: q.remaining,
    onboarded: q.onboarded,
    limitReached: q.limitReached,
  });
}
