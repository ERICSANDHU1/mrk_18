import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendFetch, getFounderId } from "@/lib/server/backend";

/** Diagnose an UPLOADED dataset (the CHIEF CSV flow). Explicit-trigger only —
 *  the client calls this from the "Run analysis" button, never automatically.
 *  Thin proxy onto the backend's existing /analytics/diagnose; no schema changes. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const founderId = await getFounderId();
  if (!founderId) return NextResponse.json({ error: "no founder record" }, { status: 400 });

  let payload: { metrics?: unknown; period?: unknown; clarifications?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const metrics = payload?.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return NextResponse.json({ error: "metrics object required" }, { status: 422 });
  }
  // founder follow-up answers → the interpreter re-reads with them (capped here too)
  const clarifications = Array.isArray(payload.clarifications)
    ? payload.clarifications
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 600))
        .slice(0, 30)
    : undefined;
  // whitelist exactly what the backend's DiagnoseBody accepts (extra=forbid there)
  const body = JSON.stringify({
    metrics,
    source: "csv",
    period: typeof payload.period === "string" ? payload.period.slice(0, 80) : null,
    ...(clarifications && clarifications.length ? { clarifications } : {}),
  });
  if (body.length > 250_000) {
    return NextResponse.json({ error: "dataset too large for analysis" }, { status: 413 });
  }

  let res: Response;
  try {
    res = await backendFetch(`/founders/${founderId}/analytics/diagnose`, {
      method: "POST",
      body,
    });
  } catch {
    return NextResponse.json({ error: "could not reach the backend" }, { status: 502 });
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (out as { detail?: unknown })?.detail;
    return NextResponse.json(
      { error: typeof detail === "string" ? detail : "analysis failed", status: res.status },
      { status: res.status },
    );
  }
  return NextResponse.json(out);
}
