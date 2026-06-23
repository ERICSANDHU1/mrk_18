import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** Poll a run's state (status, report, gate1, cost). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const res = await backendFetch(`/runs/${id}`);
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
