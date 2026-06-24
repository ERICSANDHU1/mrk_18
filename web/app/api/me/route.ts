import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** PATCH — update the founder's settings (workspace name, website, …) via the
 *  backend's DPDP correction endpoint (works even on a locked profile). */
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const res = await backendFetch(`/founders/${founderId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** DELETE — erase the workspace (DPDP right to erasure). */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  const res = await backendFetch(`/founders/${founderId}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
