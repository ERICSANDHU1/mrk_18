import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch } from "@/lib/server/backend";

/** Per-slide Edit at Gate 1 — re-run ONE agent with the founder's tweak and patch
 *  just that section. The open review re-renders on its next poll. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const payload = await req.json().catch(() => ({}));
  let res: Response;
  try {
    res = await backendFetch(`/runs/${id}/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
