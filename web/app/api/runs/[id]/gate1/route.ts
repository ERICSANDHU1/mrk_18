import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** Gate 1 decision: approve the intelligence report, or flag disagreements. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const decision = await req.json(); // { action: "approve" | "flag", flags: string[] }
  const res = await backendFetch(`/runs/${id}/gate1`, {
    method: "POST",
    body: JSON.stringify(decision),
  });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
