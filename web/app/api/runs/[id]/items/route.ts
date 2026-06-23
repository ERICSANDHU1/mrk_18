import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** The generated content items for a run (Gate 2 review). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const res = await backendFetch(`/runs/${id}/items`);
  const body = await res.json().catch(() => []);
  return NextResponse.json(body, { status: res.status });
}
