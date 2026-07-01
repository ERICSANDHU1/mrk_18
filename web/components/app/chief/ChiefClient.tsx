"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Loader2,
  MessageSquare,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cleanCmoText } from "@/lib/text";
import { Skeleton } from "@/components/app/ui/Skeleton";

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
type ChatMsg = { id: string; role: "user" | "cmo"; text: string };

const fmtINR = (n?: number) =>
  typeof n === "number" ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—";

/* ── demo data (until real sources are live) ─────────────────────────────── */
const SPEND_30D = [
  { d: "Jun 3", spend: 3200, leads: 9 },
  { d: "Jun 5", spend: 3600, leads: 11 },
  { d: "Jun 7", spend: 3400, leads: 10 },
  { d: "Jun 9", spend: 4100, leads: 14 },
  { d: "Jun 11", spend: 3900, leads: 13 },
  { d: "Jun 13", spend: 4600, leads: 16 },
  { d: "Jun 15", spend: 5200, leads: 19 },
  { d: "Jun 17", spend: 4800, leads: 17 },
  { d: "Jun 19", spend: 5600, leads: 22 },
  { d: "Jun 21", spend: 5300, leads: 20 },
  { d: "Jun 23", spend: 6100, leads: 25 },
  { d: "Jun 25", spend: 5800, leads: 24 },
  { d: "Jun 27", spend: 6600, leads: 28 },
  { d: "Jun 29", spend: 6900, leads: 30 },
  { d: "Jul 1", spend: 7400, leads: 33 },
];
const CHANNELS = [
  { name: "Meta", spend: 64000 },
  { name: "Google", spend: 41500 },
  { name: "LinkedIn", spend: 22000 },
  { name: "X", spend: 15000 },
];
const FUNNEL = [
  { stage: "Visitors", n: 12400 },
  { stage: "Signups", n: 1180 },
  { stage: "Activated", n: 512 },
  { stage: "Paying", n: 96 },
];
const KPIS = [
  { label: "Ad spend · 30d", value: "₹1,42,500", delta: "+12%", good: true },
  { label: "CAC", value: "₹312", delta: "−8%", good: true },
  { label: "Leads · 30d", value: "458", delta: "+23%", good: true },
  { label: "ROAS", value: "3.4×", delta: "+0.4", good: true },
];

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "0 8px 24px var(--shadow-color)",
} as const;

/** Chief — the founder's command center: the week visualised (spend, channels,
 *  funnel), the CMO's read on it, and the chief chat. The detail rooms (Leaks,
 *  Eagle view, Channels, Content, Funnel, Watchdog) live in the sidebar. */
export default function ChiefClient() {
  const [analytics, setAnalytics] = useState<Analytics>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
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
    Promise.all([j("/api/analytics/latest"), j("/api/connections"), j("/api/me/profile")]).then(
      ([a, c, prof]) => {
        if (!active) return;
        setAnalytics(a ?? null);
        setConnections(Array.isArray(c) ? c : []);
        setCompany(prof?.profile?.company_name ?? "");
        setLoading(false);
      },
    );
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
  const live = typeof analytics?.metrics?.total_spend === "number";
  const maxChannel = Math.max(...CHANNELS.map((c) => c.spend));

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
          <div className="flex items-center gap-2">
            {!live && !loading && (
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-watch" />
                Demo data
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${connected.length ? "bg-good" : "bg-mute-2"}`}
              />
              {connected.length} source{connected.length === 1 ? "" : "s"} live
            </span>
          </div>
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

        {/* KPI row */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KPIS.map((k, i) => (
            <div key={k.label} className="rounded-2xl border border-line bg-surface px-3.5 py-3">
              <div className="text-[11px] text-mute-2">{k.label}</div>
              {loading ? (
                <Skeleton className="mt-1.5 h-6 w-16 rounded-md" />
              ) : (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[20px] font-semibold text-ink">
                    {i === 0 && live ? fmtINR(analytics?.metrics?.total_spend) : k.value}
                  </span>
                  <span
                    className={`flex items-center gap-0.5 text-[11px] font-semibold ${k.good ? "text-good" : "text-bad"}`}
                  >
                    {k.delta.startsWith("−") ? (
                      <ArrowDownRight size={11} aria-hidden />
                    ) : (
                      <ArrowUpRight size={11} aria-hidden />
                    )}
                    {k.delta}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* spend over time */}
        <div className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Ad spend · last 30 days</span>
            <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">₹ / day</span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={SPEND_30D} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--molten)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--molten)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 6" vertical={false} />
                <XAxis
                  dataKey="d"
                  tick={{ fill: "var(--mute-2)", fontSize: 10.5 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--line)" }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: "var(--mute-2)", fontSize: 10.5 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--mute-2)", fontSize: 11 }}
                  formatter={(value) => [fmtINR(Number(value)), "Spend"]}
                  cursor={{ stroke: "var(--line)" }}
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--molten)"
                  strokeWidth={2}
                  fill="url(#spendFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* channels + funnel */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Spend by channel</span>
              <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">30d</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CHANNELS} layout="vertical" margin={{ top: 0, right: 8, left: -6, bottom: 0 }}>
                  <XAxis type="number" hide domain={[0, maxChannel]} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [fmtINR(Number(value)), "Spend"]}
                    cursor={{ fill: "var(--overlay-subtle)" }}
                  />
                  <Bar dataKey="spend" radius={[4, 8, 8, 4]} barSize={18}>
                    {CHANNELS.map((c, i) => (
                      <Cell key={c.name} fill="var(--molten)" fillOpacity={1 - i * 0.18} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Signup funnel</span>
              <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">30d</span>
            </div>
            <div className="space-y-3.5 pt-1">
              {FUNNEL.map((f, i) => {
                const width = (f.n / FUNNEL[0].n) * 100;
                const conv = i === 0 ? null : (f.n / FUNNEL[i - 1].n) * 100;
                return (
                  <div key={f.stage}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[12px] font-medium text-ink">{f.stage}</span>
                      <span className="font-data text-[11px] text-mute">
                        {f.n.toLocaleString("en-IN")}
                        {conv !== null && (
                          <span className="text-mute-2"> · {conv.toFixed(0)}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-molten"
                        style={{ width: `${Math.max(width, 2)}%`, opacity: 1 - i * 0.16 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
                        ? "font-claude-serif rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                        : "rounded-tr-sm bg-surface-2 text-ink"
                    }`}
                  >
                    {m.role === "cmo" ? cleanCmoText(m.text) : m.text}
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
