import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

const EMPTY = { diagnosis: null, metrics: null };

/** The most recent stored ad-analytics diagnosis for the dashboard (or nulls). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json(EMPTY, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json(EMPTY);
  const res = await backendFetch(`/founders/${founderId}/analytics/latest`);
  const body = await res.json().catch(() => EMPTY);
  return NextResponse.json(res.ok ? body : EMPTY);
}
