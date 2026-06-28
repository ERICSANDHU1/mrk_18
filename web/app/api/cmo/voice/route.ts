import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** One turn of the live CMO conversation — proxies the running transcript to the
 *  FastAPI backend, which replies AS the founder's CMO (grounded in their memory). */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) {
    return NextResponse.json({ error: "no founder record yet" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }
  const mode = body?.mode === "text" ? "text" : "voice";

  const res = await backendFetch(`/founders/${founderId}/cmo/voice`, {
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
