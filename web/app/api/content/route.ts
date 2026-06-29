import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The founder's whole content library — every generated post/script across runs. */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json([], { status: 200 });

  const qs = new URL(req.url).searchParams.toString();
  const res = await backendFetch(`/founders/${founderId}/content${qs ? `?${qs}` : ""}`);
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}
