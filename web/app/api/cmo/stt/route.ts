import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The live call's ears: one recorded founder turn (raw audio body) → the backend
 *  → Groq Whisper (free tier) → { text }. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) {
    return NextResponse.json({ error: "no founder record yet" }, { status: 400 });
  }

  const audio = await req.arrayBuffer();
  const res = await backendFetch(`/founders/${founderId}/cmo/stt`, {
    method: "POST",
    body: audio,
    headers: { "Content-Type": req.headers.get("content-type") || "audio/webm" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "transcription failed" },
      { status: res.status },
    );
  }
  return NextResponse.json(data); // { text }
}
