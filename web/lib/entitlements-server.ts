import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasProAccess } from "./entitlements";

/** The server-side gate for the Founding-500 surfaces (Chief, Comrk).
 *
 *  The Rail's 🔒 is only a UI affordance — before this, a signed-in user could
 *  reach /chief or /cowork by typing the URL, no lock at all. This enforces the
 *  same allowlist on the server: a non-entitled visitor is bounced to the
 *  pricing page (the 3 tiers), matching what clicking the locked tab now does.
 *  (Unauthenticated users never get this far — the Clerk middleware sends them
 *  to sign-in first.)
 *
 *  `hasProAccess` keys off an email allowlist, so we need the full user record;
 *  `auth()` only carries the userId. Replace with a DB plan flag when billing
 *  ships — the call site stays the same. */
export async function requireProAccess(): Promise<void> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  if (!hasProAccess(email)) {
    redirect("/pricing");
  }
}
