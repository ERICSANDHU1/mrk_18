import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The live call's ears: one recorded turn (raw audio body) → the backend →
 *  Groq Whisper (free tier) → { text }. Works with or without a registered
 *  company (guests get the same ears — the brain differs). */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();

  const audio = await req.arrayBuffer();
  const res = await backendFetch(founderId ? `/founders/${founderId}/cmo/stt` : "/cmo/guest/stt", {
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
