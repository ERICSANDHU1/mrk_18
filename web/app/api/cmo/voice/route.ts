import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** One turn of the CMO conversation. Onboarded founder → their personal CMO
 *  (grounded, routed, RAG). No company yet → the mrk18 GUIDE.
 *
 *  The daily free-chat cap (5/day pre-onboarding, per account) is enforced in the
 *  BACKEND — this route just forwards and surfaces the backend's 402 so the UI can
 *  pop the onboarding / upgrade modal. The reply carries fresh `usage`. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }
  const mode = body?.mode === "text" ? "text" : "voice";
  // mrk1 (fast, 1 unit) / mrk2 (premium, 2 units). Only meaningful on the onboarded
  // Comrk path; the free/guest tier is locked to mrk1 in the backend regardless.
  const model = body?.model === "mrk2" ? "mrk2" : "mrk1";

  // Typed turn + onboarded founder → the routed, RAG-grounded Comrk chat. Voice
  // turns, or a visitor with no company yet → the personality / guide path.
  const useComrk = mode === "text" && !!founderId;
  const path = useComrk
    ? `/founders/${founderId}/comrk`
    : founderId
      ? `/founders/${founderId}/cmo/voice`
      : "/cmo/guest/voice";
  const payload = useComrk
    ? { messages: messages.slice(-40), model }
    : { messages: messages.slice(-40), mode };
  const res = await backendFetch(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    // the backend's daily-cap 402 carries a structured detail — surface
    // limit_reached so the UI opens the onboarding / upgrade popup.
    if (res.status === 402 && detail && typeof detail === "object") {
      const d = detail as Record<string, unknown>;
      return NextResponse.json(
        {
          error: d.message ?? "you've used today's free chats",
          limit_reached: true,
          onboarded: !!d.onboarded,
          resets_in: d.resets_in,
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "the CMO couldn't respond" },
      { status: res.status },
    );
  }
  return NextResponse.json(data); // { reply, adapter?, usage? } — usage from the backend
}
