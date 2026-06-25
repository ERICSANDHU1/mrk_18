import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Manually re-pull + re-diagnose the founder's Meta ad data (refresh button). */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/analytics/sync-meta`, { method: "POST" });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail;
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "sync failed", status: res.status },
      { status: res.status },
    );
  }
  return NextResponse.json(body);
}
