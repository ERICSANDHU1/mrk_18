import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** List the founder's connected platform accounts (status/scopes only — never
 *  token material). Degrades to [] so the dashboard never crashes. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json([], { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json([]);
  const res = await backendFetch(`/founders/${founderId}/connections`);
  const body = await res.json().catch(() => []);
  return NextResponse.json(res.ok && Array.isArray(body) ? body : []);
}
