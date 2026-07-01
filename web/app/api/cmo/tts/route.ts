import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The CMO's voice: { text } → the backend (free MS neural en-IN male voice, Groq
 *  Orpheus fallback) → audio bytes. 503 → the client uses the browser voice. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) {
    return NextResponse.json({ error: "no founder record yet" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.slice(0, 600) : "";
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });

  const res = await backendFetch(`/founders/${founderId}/cmo/tts`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "tts failed" },
      { status: res.status },
    );
  }
  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    headers: { "Content-Type": res.headers.get("content-type") || "audio/mpeg" },
  });
}
