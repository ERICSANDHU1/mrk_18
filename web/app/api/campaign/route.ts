import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The onboarded founder's ONE free campaign (2 Nano-Banana creatives). GET reads
 *  the stored one; POST generates it (cap enforced in the backend). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId)
    return NextResponse.json({ creatives: [], used: false, remaining: 1, onboarded: false });
  const res = await backendFetch(`/founders/${founderId}/campaign`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json({ ...data, onboarded: true }, { status: res.ok ? 200 : res.status });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId)
    return NextResponse.json({ error: "Finish onboarding first — your CMO needs your company." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 500) : "";
  const res = await backendFetch(`/founders/${founderId}/campaign`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "Couldn't build your campaign — try again." },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
