import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Disconnect a platform (e.g. "meta") — revokes the stored tokens for this
 *  founder. The founder then reconnects from scratch, which is the ONLY way to
 *  switch which ad account is linked: the backend picks the primary ad account
 *  from whatever the OAuth asset picker shared, so changing accounts means
 *  redoing consent and sharing a different one. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  const { platform } = await params;
  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/connections/${platform}`, {
      method: "DELETE",
    });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail;
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "could not disconnect" },
      { status: res.status },
    );
  }
  return NextResponse.json(body);
}
