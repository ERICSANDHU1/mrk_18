import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Begin an OAuth connect for a platform (e.g. "meta"). Returns { authorize_url }
 *  — the browser redirects there to the user's OWN provider account to approve. */
export async function POST(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  const { platform } = await params;
  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/connections/${platform}/start`, {
      method: "POST",
    });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail;
    return NextResponse.json(
      {
        error: typeof detail === "string" ? detail : "could not start the connection",
        status: res.status,
      },
      { status: res.status },
    );
  }
  return NextResponse.json(body); // { authorize_url, state }
}
