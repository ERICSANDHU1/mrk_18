import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { BrainSeed } from "@/components/app/cowork/OnboardingForm";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const CONSENT_VERSION = "mrk18-consent-v1-2026";

const GOAL_LABEL: Record<string, string> = {
  awareness: "Awareness",
  signups: "Signups",
  revenue: "Revenue",
  retention: "Retention",
};

// The backend only publishes to these three; map the founder's channels to them.
const PLATFORM_MAP: Record<string, string> = {
  LinkedIn: "linkedin",
  "X / Twitter": "x",
  Instagram: "instagram",
};

/** Map the onboarding answers to the backend's IntakeDraft contract. */
function toIntakeDraft(d: BrainSeed) {
  const productDescription = [
    d.oneLiner,
    d.usp && `What makes us different: ${d.usp}`,
    d.problem && `The problem we solve: ${d.problem}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const targetPlatforms = [
    ...new Set((d.channels ?? []).map((c) => PLATFORM_MAP[c]).filter(Boolean)),
  ];

  return {
    company_name: d.productName?.trim(),
    website: d.domain?.trim(),
    product_description: productDescription,
    icp: d.targetCustomer?.trim(),
    top_competitors: d.competitors,
    tone: d.voice.join(", "),
    primary_goal: GOAL_LABEL[d.goal] ?? d.goal,
    monthly_spend_inr: Number(String(d.monthlySpend ?? "").replace(/[^\d]/g, "")) || 0,
    target_platforms: targetPlatforms,
    consent_given: d.consent === true,
    consent_text_version: CONSENT_VERSION,
  };
}

async function backend(path: string, token: string, init?: RequestInit) {
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "no session token" }, { status: 401 });
  }

  const data = (await req.json()) as BrainSeed;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  // 1) Ensure a founder row exists for this Clerk identity.
  let founderId: string | null = null;
  const created = await backend("/founders", token, {
    method: "POST",
    body: JSON.stringify({ email, display_name: user?.fullName ?? null }),
  });
  if (created.status === 201) {
    founderId = (await created.json()).founder_id;
  } else if (created.status === 409) {
    const me = await backend("/me", token);
    if (me.ok) founderId = (await me.json()).founder_id;
  }
  if (!founderId) {
    const detail = await created.text();
    return NextResponse.json(
      { error: "could not create or find your founder record", detail },
      { status: 502 },
    );
  }

  // 2) Save the full intake draft.
  const draft = toIntakeDraft(data);
  const saved = await backend(`/founders/${founderId}/intake`, token, {
    method: "PUT",
    body: JSON.stringify(draft),
  });
  if (!saved.ok) {
    const detail = await saved.text();
    return NextResponse.json({ error: "failed to save your answers", detail }, { status: 502 });
  }

  // 3) Promote the draft to a validated FounderProfile (the 100% gate).
  const completed = await backend(`/founders/${founderId}/intake/complete`, token, {
    method: "POST",
  });
  const body = await completed.json().catch(() => ({}));
  if (!completed.ok) {
    // 422 → the gate rejected it. FastAPI wraps HTTPException detail in
    // { detail: {...} }, so unwrap it — otherwise missing_fields / problems get
    // buried and the form shows an empty "needs fixing" with no reason.
    const d = (body as { detail?: unknown })?.detail;
    const detail =
      d && typeof d === "object" ? (d as Record<string, unknown>) : { message: d };
    return NextResponse.json(
      { error: "intake_incomplete", founderId, ...detail },
      { status: completed.status },
    );
  }

  return NextResponse.json({ ok: true, founderId, status: body.status ?? "ready_for_analysis" });
}
