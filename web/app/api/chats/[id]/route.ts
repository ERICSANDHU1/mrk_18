import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Resolve the signed-in founder, or an error response to short-circuit with. */
async function founderOrError(): Promise<{ founderId: string } | { error: NextResponse }> {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  const founderId = await getFounderId();
  if (!founderId) return { error: NextResponse.json({ error: "no founder record yet" }, { status: 400 }) };
  return { founderId };
}

/** Load one saved chat (its full transcript). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await founderOrError();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const res = await backendFetch(`/founders/${ctx.founderId}/chats/${id}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** Save the running transcript for a chat (called each turn). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await founderOrError();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await backendFetch(`/founders/${ctx.founderId}/chats/${id}`, {
    method: "PUT",
    body: JSON.stringify({ messages: body?.messages ?? [], title: body?.title }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** Rename / pin / archive a chat (from the Recents ⋮ menu). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await founderOrError();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await backendFetch(`/founders/${ctx.founderId}/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** Delete a saved chat. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await founderOrError();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const res = await backendFetch(`/founders/${ctx.founderId}/chats/${id}`, { method: "DELETE" });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
