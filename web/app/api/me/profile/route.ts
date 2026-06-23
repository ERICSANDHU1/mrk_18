import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** The signed-in founder's id + intake status + (when complete) their saved profile. */
export async function GET() {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "no session token" }, { status: 401 });

  const headers = { Authorization: `Bearer ${token}` };

  const meRes = await fetch(`${BACKEND_URL}/me`, { headers, cache: "no-store" });
  if (meRes.status === 403) {
    // signed in but no founder row yet (webhook hasn't provisioned them)
    return NextResponse.json({ founderId: null, status: "no_founder", complete: false, profile: null });
  }
  if (!meRes.ok) {
    return NextResponse.json({ error: "backend unavailable" }, { status: 502 });
  }
  const me = await meRes.json();

  const intakeRes = await fetch(`${BACKEND_URL}/founders/${me.founder_id}/intake`, {
    headers,
    cache: "no-store",
  });
  if (!intakeRes.ok) {
    return NextResponse.json({
      founderId: me.founder_id,
      email: me.email,
      status: "draft",
      complete: false,
      profile: null,
    });
  }
  const intake = await intakeRes.json();
  return NextResponse.json({
    founderId: me.founder_id,
    email: me.email,
    status: intake.status,
    complete: !!intake.complete,
    profile: intake.profile ?? null,
  });
}
