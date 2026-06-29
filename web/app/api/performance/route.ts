import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Eagle View — the founder's post performance ranking (engagement, half-life). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ ranking: [] }, { status: 200 });

  const res = await backendFetch(`/founders/${founderId}/performance`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
