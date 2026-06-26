import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/** ElevenLabs text-to-speech WITH per-character timestamps, proxied so the API
 *  key never reaches the browser. Returns { audio_base64, alignment } where
 *  alignment.character_start_times_seconds drives word-highlighting off audio
 *  playback. 503 when no key is set → the client falls back to free Web Speech. */
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // "Rachel" (default library voice)
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5"; // fast + cheap + supports timestamps

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "tts not configured" }, { status: 503 });

  const { text } = await req.json().catch(() => ({}));
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "no text" }, { status: 400 });
  }
  const clipped = text.slice(0, 2500); // free-tier credit guard

  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: clipped, model_id: MODEL }),
    });
  } catch {
    return NextResponse.json({ error: "could not reach ElevenLabs" }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "tts failed", status: res.status, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => null);
  if (!data?.audio_base64 || !data?.alignment) {
    return NextResponse.json({ error: "unexpected tts response" }, { status: 502 });
  }
  // pass only what the client needs (audio + per-character timing)
  return NextResponse.json({ audio_base64: data.audio_base64, alignment: data.alignment });
}
