import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** The signed-in founder's saved CMO chats (Recents). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json([], { status: 200 }); // no founder yet → empty list

  const res = await backendFetch(`/founders/${founderId}/chats`);
  const data = await res.json().catch(() => []);
  return NextResponse.json(data, { status: res.status });
}

/** Start a new chat (titled from the first message on the backend). */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record yet" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const res = await backendFetch(`/founders/${founderId}/chats`, {
    method: "POST",
    body: JSON.stringify({ messages: body?.messages ?? [], title: body?.title }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
