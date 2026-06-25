import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** List the signed-in founder's recent runs (newest first). Degrades to [] so the
 *  workspace never crashes when the backend is unreachable. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json([], { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json([]);
  const res = await backendFetch(`/founders/${founderId}/runs?limit=20`);
  const body = await res.json().catch(() => []);
  return NextResponse.json(res.ok && Array.isArray(body) ? body : []);
}

/** Start a new analysis run for the signed-in founder. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) {
    return NextResponse.json({ error: "no founder record yet" }, { status: 400 });
  }

  const res = await backendFetch(`/founders/${founderId}/runs`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof body.detail === "string" ? body.detail : "could not start the run" },
      { status: res.status },
    );
  }
  return NextResponse.json(body); // RunView { run_id, status, ... }
}
