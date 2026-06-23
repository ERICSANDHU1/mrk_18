import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** Gate 2 decisions: per-item approve / reject (reject can carry a re-work note). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const decisions = await req.json(); // { decisions: [{ item_id, action, note }] }
  const res = await backendFetch(`/runs/${id}/gate2`, {
    method: "POST",
    body: JSON.stringify(decisions),
  });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
