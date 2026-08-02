import { auth } from "@clerk/nextjs/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** Call the FastAPI backend as the signed-in founder (attaches the Clerk token). */
export async function backendFetch(path: string, init?: RequestInit) {
  const { getToken } = await auth();
  const token = await getToken();
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Resolve the signed-in founder's id via the backend's /me. */
export async function getFounderId(): Promise<string | null> {
  const res = await backendFetch("/me");
  if (!res.ok) return null;
  const me = await res.json().catch(() => null);
  return me?.founder_id ?? null;
}

/** The signed-in founder's id + whether they've completed onboarding (intake is
 *  ready_for_analysis). Drives the chat quota tier: pre-onboarding vs onboarded.
 *  Degrades to { null, false } if the backend is unreachable. */
export async function getOnboarding(): Promise<{ founderId: string | null; complete: boolean }> {
  try {
    const res = await backendFetch("/me");
    if (!res.ok) return { founderId: null, complete: false };
    const me = await res.json().catch(() => null);
    if (!me?.founder_id) return { founderId: null, complete: false };
    const intakeRes = await backendFetch(`/founders/${me.founder_id}/intake`);
    const intake = intakeRes.ok ? await intakeRes.json().catch(() => null) : null;
    return { founderId: me.founder_id, complete: !!intake?.complete };
  } catch {
    return { founderId: null, complete: false };
  }
}
