/** Save a conversation into the founder's chat sessions (the sidebar Recents).
 *  Creates the chat on the first save, updates it afterwards. Fire-and-forget
 *  friendly: failures are swallowed (guests without a founder row just don't
 *  get persistence). Returns the session id to thread through later saves. */

export type StoredMsg = { role: "user" | "cmo"; text: string };

export async function saveChat(
  sessionId: string | null,
  messages: StoredMsg[],
): Promise<string | null> {
  const payload = { messages };
  try {
    if (sessionId) {
      await fetch(`/api/chats/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      window.dispatchEvent(new CustomEvent("mrk18:chats-changed"));
      return sessionId;
    }
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    window.dispatchEvent(new CustomEvent("mrk18:chats-changed"));
    return res.ok && data?.id ? (data.id as string) : null;
  } catch {
    return sessionId; // best-effort — keep whatever id we had
  }
}
