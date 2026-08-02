import { auth, clerkClient } from "@clerk/nextjs/server";
import { getOnboarding } from "./backend";

/**
 * The free-chat funnel, counted PER ACCOUNT (durable in Clerk privateMetadata, so
 * it survives logout and new sessions — you can't reset it by signing out).
 *
 *   • Before onboarding:  FREE_PRE messages, then a popup asks for full company
 *     context and opens onboarding.
 *   • After onboarding:   FREE_POST more messages (CAP_POST total), then the
 *     upgrade (Founding 500) modal.
 *
 * A "chat" here is ONE message you send (one turn). The count lives in
 * `privateMetadata.chatCount`; enforcement + increment happen in /api/cmo/voice.
 */
export const FREE_PRE = 5; // messages allowed before onboarding
export const FREE_POST = 10; // additional messages unlocked by onboarding
export const CAP_POST = FREE_PRE + FREE_POST; // 15 total once onboarded

export type ChatQuota = {
  used: number;
  cap: number;
  remaining: number;
  onboarded: boolean;
  limitReached: boolean;
  /** founder id when one exists — reused by the chat route so it isn't re-fetched. */
  founderId: string | null;
};

function readCount(meta: unknown): number {
  const n = Number((meta as { chatCount?: unknown })?.chatCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The caller's current chat quota, or null when unauthenticated. */
export async function readChatQuota(): Promise<ChatQuota | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const used = readCount(user.privateMetadata);

  const { founderId, complete } = await getOnboarding();
  const cap = complete ? CAP_POST : FREE_PRE;

  return {
    used,
    cap,
    remaining: Math.max(0, cap - used),
    onboarded: complete,
    limitReached: used >= cap,
    founderId,
  };
}

/** Consume one chat — persist the new count on the account. Best-effort: a Clerk
 *  write hiccup must never fail the founder's turn (they just aren't charged). */
export async function bumpChatCount(userId: string, currentUsed: number): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      privateMetadata: { chatCount: currentUsed + 1 },
    });
  } catch {
    /* non-fatal — don't burn the reply on a metadata write error */
  }
}
