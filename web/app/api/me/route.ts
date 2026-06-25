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

  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}`, { method: "DELETE" });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "delete failed", status: res.status, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }
  return new NextResponse(text || "{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
