import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/server/backend";

/** Public Founding-500 application — forwards the form to the backend (no auth;
 *  the /apply endpoint is public + rate-limited + honeypot-guarded).
 *
 *  Both the landing modal AND the standalone /form static site (a *separate*
 *  origin) post here, so this one route allows cross-origin POST. It's write-only
 *  and returns nothing sensitive, so an open CORS policy here is safe. */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Live queue size (real applications + seed) for the "#N in line" counter. */
export async function GET() {
  try {
    const res = await backendFetch("/apply/count");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ count: 0, in_line: 78 }, { headers: CORS });
    return NextResponse.json(data, { headers: CORS });
  } catch {
    return NextResponse.json({ count: 0, in_line: 78 }, { headers: CORS });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let res: Response;
  try {
    res = await backendFetch("/apply", { method: "POST", body: JSON.stringify(body) });
  } catch {
    return NextResponse.json({ error: "could not reach the server" }, { status: 502, headers: CORS });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "could not submit your application" },
      { status: res.status, headers: CORS },
    );
  }
  return NextResponse.json(data, { headers: CORS });
}
