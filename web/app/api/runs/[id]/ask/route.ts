import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Per-slide follow-up chat on a finished run — routed to that slide's adapter.
 *  Thin Clerk-authed proxy onto the backend's /runs/{id}/ask. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });
  const { id } = await params;

  let payload: { adapter?: unknown; context?: unknown; messages?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/runs/${id}/ask`, {
      method: "POST",
      body: JSON.stringify({
        adapter: payload.adapter,
        context: payload.context,
        messages: payload.messages,
      }),
    });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "the CMO couldn't respond", status: res.status },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
