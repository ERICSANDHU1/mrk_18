import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** GET — full data export (DPDP right to access). Passes the backend JSON through
 *  verbatim on success; on any failure returns a clear error (never a silent {}). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/data-export`);
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "export failed", status: res.status, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }
  // pass the backend's JSON straight through (no re-parse → no data loss)
  return new NextResponse(text, { status: 200, headers: { "Content-Type": "application/json" } });
}
