import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** One turn of the live CMO conversation. Onboarded founder → their personal CMO
 *  (grounded in company memory). No company registered yet → the mrk18 GUIDE, an
 *  assistant that knows the product and every page of the site. */
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

  const path = founderId ? `/founders/${founderId}/cmo/voice` : "/cmo/guest/voice";
  const res = await backendFetch(path, {
    method: "POST",
    body: JSON.stringify({ messages: messages.slice(-40), mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "the CMO couldn't respond" },
      { status: res.status },
    );
  }
  return NextResponse.json(data); // { reply }
}
