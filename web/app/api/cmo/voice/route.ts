import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";
import { bumpChatCount, readChatQuota } from "@/lib/server/chat-quota";

/** One turn of the live CMO conversation. Onboarded founder → their personal CMO
 *  (grounded in company memory). No company registered yet → the mrk18 GUIDE, an
 *  assistant that knows the product and every page of the site.
 *
 *  Free-chat funnel: each turn is metered per account (chat-quota). At the limit
 *  we 402 instead of calling the CMO — the UI turns that into the onboarding /
 *  upgrade popup. A turn is only charged once the CMO actually replies. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const quota = await readChatQuota();
  if (quota?.limitReached) {
    return NextResponse.json(
      { error: "free chat limit reached", limit_reached: true, onboarded: quota.onboarded },
      { status: 402 },
    );
  }
  const founderId = quota?.founderId ?? null;

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }
  const mode = body?.mode === "text" ? "text" : "voice";

  // Typed turns for an onboarded founder → the routed, RAG-grounded Comrk chat
  // (a classifier picks the adapter; grounded in profile + Company-Brain). Voice
  // turns, or a visitor with no company yet → the fast personality path (short
  // spoken reply, or the product guide for guests).
  const useComrk = mode === "text" && !!founderId;
  const path = useComrk
    ? `/founders/${founderId}/comrk`
    : founderId
      ? `/founders/${founderId}/cmo/voice`
      : "/cmo/guest/voice";
  const payload = useComrk
    ? { messages: messages.slice(-40) } // comrk takes just the history
    : { messages: messages.slice(-40), mode };
  const res = await backendFetch(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "the CMO couldn't respond" },
      { status: res.status },
    );
  }

  // The CMO replied → charge one chat and hand the UI the fresh count so it can
  // update the counter and pop the modal the moment the allowance runs out.
  const used = quota ? quota.used + 1 : 0;
  const cap = quota?.cap ?? null;
  if (quota) await bumpChatCount(userId, quota.used);
  return NextResponse.json({
    ...data, // { reply, adapter? }
    usage: quota
      ? { used, cap, remaining: Math.max(0, (cap ?? 0) - used), onboarded: quota.onboarded }
      : undefined,
  });
}
