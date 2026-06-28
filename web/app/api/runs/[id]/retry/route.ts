import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** Resume a failed run from where it stopped (content generation/save) — no re-run
 *  of the analysis. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  let res: Response;
  try {
    res = await backendFetch(`/runs/${id}/retry`, { method: "POST" });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
