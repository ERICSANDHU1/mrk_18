/** Flatten the CMO's occasional markdown into clean plain text. The chat bubbles
 *  render text raw, so **bold**, > quotes, ### headings, `code` and *italics*
 *  would otherwise leak their symbols. Social hashtags (#FounderLife) and plain
 *  URLs are deliberately left intact — only markdown syntax is removed. */
export function cleanCmoText(s: string): string {
  if (!s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/__([^_]+)__/g, "$1") // __bold__ → bold
    .replace(/`([^`]+)`/g, "$1") // `code` → code
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 — $2") // [text](url) → text — url
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ### heading → heading (keeps #hashtags)
    .replace(/^\s{0,3}>\s?/gm, "") // > quote → quote
    .replace(/^\s{0,3}[-*+]\s+/gm, "• ") // - item → • item
    .replace(/\*/g, "") // any stray asterisks (italics, leftovers)
    .replace(/\n{3,}/g, "\n\n") // tidy oversized gaps
    .trim();
}
