// Shared client helper for the "#N in line" counter — the live waitlist position
// (marketing seed + real applications) from the public GET /api/apply. Every
// surface (landing modal, /mrk bar, standalone /form) reads through this so the
// number is real and consistent.
export const WAITLIST_FALLBACK = 78;

export async function fetchInLine(): Promise<number> {
  try {
    const r = await fetch("/api/apply", { cache: "no-store" });
    const d = await r.json();
    return typeof d?.in_line === "number" ? d.in_line : WAITLIST_FALLBACK;
  } catch {
    return WAITLIST_FALLBACK;
  }
}
