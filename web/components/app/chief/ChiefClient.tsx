"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpRight,
  Droplet,
  Eye,
  Files,
  Filter,
  Loader2,
  MessageSquare,
  Plug,
  Radar,
} from "lucide-react";

type Diagnosis = {
  headline?: string;
  working?: string[];
  leaking?: string[];
  scale?: string[];
  cut?: string[];
  next_move?: string;
} | null;
type Analytics = {
  diagnosis: Diagnosis;
  metrics: { total_spend?: number; campaigns?: { name: string; spend?: number }[] } | null;
  created_at?: string;
} | null;
type Connection = { platform: string; status: string; needs_reconnect?: boolean };
type ContentItem = { item_id: string; platform: string; format: string; body: string; status: string };
type Rank = { item_id: string; platform: string; body: string; latest_engagement_rate?: number };
type Perf = { items_measured?: number; ranking?: Rank[] };
type ChatMsg = { id: string; role: "user" | "cmo"; text: string };

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  x: "X",
  linkedin: "LinkedIn",
  ig: "Instagram",
  instagram: "Instagram",
  reddit: "Reddit",
  google: "Google",
};

const fmtINR = (n?: number) =>
  typeof n === "number" ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—";
const pct = (n?: number) => (typeof n === "number" ? `${(n * 100).toFixed(1)}%` : "—");

function Widget({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: typeof Eye;
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-molten" aria-hidden />
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-[11px] text-mute-2 transition-colors hover:text-molten"
          >
            View <ArrowUpRight size={12} aria-hidden />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-[12.5px] leading-relaxed text-mute">{children}</p>;
}

/** Chief — the founder's command center. Reads, diagnoses, and points to the next
 *  move. Live widgets pull real data; not-yet-connected ones show a connect state. */
export default function ChiefClient() {
  const [analytics, setAnalytics] = useState<Analytics>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [perf, setPerf] = useState<Perf>({});
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const j = (url: string) =>
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([
      j("/api/analytics/latest"),
      j("/api/connections"),
      j("/api/content?limit=50"),
      j("/api/performance"),
      j("/api/me/profile"),
    ]).then(([a, c, ct, p, prof]) => {
      if (!active) return;
      setAnalytics(a ?? null);
      setConnections(Array.isArray(c) ? c : []);
      setContent(Array.isArray(ct) ? ct : []);
      setPerf(p ?? {});
      setCompany(prof?.profile?.company_name ?? "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, sendingChat]);

  // Inline chat with the CMO — same Groq endpoint as the Chat page, no redirect.
  const submitChat = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingChat) return;
      setDraft("");
      setChatErr(null);
      setSendingChat(true);
      const next: ChatMsg[] = [...chat, { id: `u-${Date.now()}`, role: "user", text }];
      setChat(next);
      const history = next.map((m) => ({
        role: m.role === "cmo" ? "assistant" : "user",
        content: m.text,
      }));
      try {
        const res = await fetch("/api/cmo/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-40), mode: "text" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.reply === "string") {
          setChat((m) => [...m, { id: `c-${Date.now()}`, role: "cmo", text: data.reply }]);
        } else {
          const noFounder = res.status === 400 && /no founder/i.test(data.error || "");
          setChatErr(
            noFounder
              ? "Finish onboarding first — your CMO activates once your workspace is set up."
              : data.error || "The CMO couldn't respond.",
          );
        }
      } catch {
        setChatErr("Couldn't reach the CMO. Is the backend running?");
      } finally {
        setSendingChat(false);
      }
    },
    [chat, sendingChat],
  );

  const diag = analytics?.diagnosis ?? null;
  const connected = connections.filter((c) => c.status === "connected");
  const leaking = diag?.leaking ?? [];
  const ranking = perf?.ranking ?? [];
  const scripts = content.filter((c) => c.format === "reel_script");
  const posts = content.filter((c) => c.format !== "reel_script");

  return (
    <div className="dash-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        {/* header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="font-display text-[28px] leading-none text-ink">Chief</h1>
            <p className="mt-1.5 text-[12.5px] text-mute">
              {company ? `${company} · ` : ""}your command center
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${connected.length ? "bg-good" : "bg-mute-2"}`}
            />
            {connected.length} source{connected.length === 1 ? "" : "s"} live
          </span>
        </div>

        {/* CMO read */}
        <div className="mb-5 flex gap-3 rounded-2xl border border-line border-l-[3px] border-l-molten bg-surface px-4 py-3.5">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-molten" aria-hidden />
          <div className="text-[13.5px] leading-relaxed text-ink">
            {loading
              ? "Reading your week…"
              : diag?.headline ||
                "Connect your marketing data and I'll give you a weekly read — what's working, what's leaking, and your next move."}
            {diag?.next_move && (
              <span className="mt-1 block text-[12.5px] text-mute">Next: {diag.next_move}</span>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Ad spend", value: fmtINR(analytics?.metrics?.total_spend) },
            { label: "Leaks flagged", value: leaking.length ? String(leaking.length) : "—" },
            { label: "Posts measured", value: perf?.items_measured ? String(perf.items_measured) : "—" },
            { label: "Connected", value: String(connected.length) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-surface-2 px-3.5 py-3">
              <div className="text-[11px] text-mute-2">{k.label}</div>
              <div className="mt-1 text-[20px] font-semibold text-ink">{k.value}</div>
            </div>
          ))}
        </div>

        {/* widget grid */}
        <div className="grid gap-3 md:grid-cols-2">
          {/* Leaks */}
          <Widget icon={Droplet} title="Leaks" href="/console/leaks">
            {leaking.length === 0 ? (
              <Empty>No leaks flagged yet — run an ad analysis to find what's burning money.</Empty>
            ) : (
              <div className="space-y-1.5">
                {leaking.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12.5px] text-ink">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" />
                    <span className="leading-snug">{l}</span>
                  </div>
                ))}
                {diag?.working?.length ? (
                  <p className="pt-1 text-[11.5px] text-good">{diag.working.length} working well</p>
                ) : null}
              </div>
            )}
          </Widget>

          {/* Eagle View — performance */}
          <Widget icon={Eye} title="Eagle view · top posts">
            {ranking.length === 0 ? (
              <Empty>No measured posts yet — they appear here once published content gathers signals.</Empty>
            ) : (
              <div className="space-y-2">
                {ranking.slice(0, 3).map((r) => (
                  <div key={r.item_id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate text-ink">
                      <span className="text-mute-2">{PLATFORM_LABEL[r.platform] ?? r.platform} · </span>
                      {r.body?.slice(0, 40) || "—"}
                    </span>
                    <span className="shrink-0 text-good">{pct(r.latest_engagement_rate)}</span>
                  </div>
                ))}
              </div>
            )}
          </Widget>

          {/* Channels & connectors */}
          <Widget icon={Plug} title="Channels & connectors" href="/console/channels">
            {connections.length === 0 ? (
              <div className="space-y-2">
                <Empty>No data sources connected yet.</Empty>
                <Link
                  href="/console/leaks"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-molten/40"
                >
                  <Plug size={13} aria-hidden /> Connect a source
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {connections.map((c) => {
                  const ok = c.status === "connected" && !c.needs_reconnect;
                  return (
                    <span
                      key={c.platform}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
                        ok ? "bg-good/10 text-good" : "bg-watch/10 text-watch"
                      }`}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                      {PLATFORM_LABEL[c.platform] ?? c.platform}
                    </span>
                  );
                })}
              </div>
            )}
          </Widget>

          {/* Content & scripts */}
          <Widget icon={Files} title="Content & scripts" href="/cowork">
            {content.length === 0 ? (
              <Empty>Nothing generated yet — start a run in Comrk to fill your library.</Empty>
            ) : (
              <div>
                <div className="flex gap-2">
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-mute">
                    {posts.length} posts
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-mute">
                    {scripts.length} scripts
                  </span>
                </div>
                {content[0] && (
                  <p className="mt-2.5 truncate text-[12.5px] text-mute">
                    Latest: {content[0].body?.slice(0, 50)}
                  </p>
                )}
              </div>
            )}
          </Widget>

          {/* Funnel — dormant */}
          <Widget icon={Filter} title="Funnel">
            <div className="space-y-2">
              <Empty>Connect your funnel data to see where signups drop off.</Empty>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] text-mute-2">
                Connect to enable
              </span>
            </div>
          </Widget>

          {/* Watchdog — dormant */}
          <Widget icon={Radar} title="Watchdog · market news">
            <div className="space-y-2">
              <Empty>Competitor moves and market shifts will surface here.</Empty>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] text-mute-2">
                Coming soon
              </span>
            </div>
          </Widget>
        </div>

        {/* chat — inline & real-time, no redirect */}
        <div className="mt-5 rounded-2xl border border-line bg-surface transition-colors focus-within:border-molten/40">
          {chat.length > 0 && (
            <div
              ref={threadRef}
              className="dash-scroll max-h-72 space-y-3 overflow-y-auto border-b border-line p-4"
            >
              {chat.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.role === "cmo"
                        ? "rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                        : "rounded-tr-sm bg-surface-2 text-ink"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sendingChat && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-molten/20 bg-molten/[0.07] px-3.5 py-2.5 text-[12.5px] text-mute">
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten" />
                    </span>
                    thinking…
                  </div>
                </div>
              )}
            </div>
          )}
          {chatErr && <p className="px-4 pt-3 text-[12px] text-ember">{chatErr}</p>}
          <div className="flex items-center gap-3 px-4 py-3">
            <MessageSquare size={16} className="shrink-0 text-mute-2" aria-hidden />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitChat(draft);
                }
              }}
              placeholder={chat.length ? "Reply to your chief…" : 'Ask your chief anything — "why is CAC up?"'}
              style={{ outline: "none" }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-mute-2"
            />
            <button
              onClick={() => submitChat(draft)}
              disabled={!draft.trim() || sendingChat}
              aria-label="Ask your chief"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-molten text-white transition-opacity hover:opacity-90 disabled:bg-surface-2 disabled:text-mute-2"
            >
              {sendingChat ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <ArrowUp size={15} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
