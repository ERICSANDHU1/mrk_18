import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/server/backend";

/** Public Founding-500 application — forwards the landing form to the backend
 *  (no auth; the /apply endpoint is public + rate-limited + honeypot-guarded). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let res: Response;
  try {
    res = await backendFetch("/apply", { method: "POST", body: JSON.stringify(body) });
  } catch {
    return NextResponse.json({ error: "could not reach the server" }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof data.detail === "string" ? data.detail : "could not submit your application" },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
