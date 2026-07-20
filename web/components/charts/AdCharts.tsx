"use client";

/** The ad-performance chart vocabulary, shared by the paid CSV dashboard
 *  (components/app/chief/CsvViews) and the free taster audit
 *  (components/taster/AdAudit).
 *
 *  Both surfaces show the same four reads — spend over time, spend by campaign,
 *  and two efficiency bars — so they live here once. The two products differ
 *  only in shell chrome (`shell`) and where the numbers come from: the paid
 *  dashboard parses the CSV in the browser, the taster renders figures Python
 *  computed. Neither difference belongs in the chart itself. */

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

export type TrendPoint = { date: string; spend: number };
/** `tone` overrides the series colour for one bar — the taster paints its worst
 *  campaign red and its best green, which is the whole point of that chart. */
export type BarRow = { name: string; value: number | null; tone?: string };

/** recharts keeps its own `value` key on every data entry, so a series named
 *  `value` silently collides and the bars render as empty groups. */
const BAR_KEY = "amount";

const APP_SHELL = "rounded-xl border border-line bg-surface-2/40 p-3.5";

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "0 8px 24px var(--shadow-color)",
} as const;

const axisTick = { fill: "var(--mute-2)", fontSize: 10 } as const;
const truncate = (n: string) => (n.length > 15 ? `${n.slice(0, 14)}…` : n);

export function ChartCard({
  title,
  note,
  caption,
  children,
  className = "",
  shell = APP_SHELL,
  height = 176,
}: {
  title: string;
  note?: string;
  /** One line telling the reader what to take from the chart. */
  caption?: string;
  children: React.ReactNode;
  className?: string;
  shell?: string;
  /** A pixel height, or "fill" to expand into a flex/grid parent — the
   *  single-screen dashboard sizes panels from the viewport, not the content. */
  height?: number | "fill";
}) {
  const fill = height === "fill";
  return (
    // min-w-0 is required, not cosmetic: a grid item defaults to
    // min-width:auto, which stops ResponsiveContainer shrinking when the
    // viewport narrows — it keeps its widest measured size and pushes the page
    // into horizontal scroll on mobile.
    // h-full on the fill variant: the card is a flex child, so without it it
    // sizes to its content and the chart body resolves to zero height —
    // ResponsiveContainer then measures 0 and renders nothing at all.
    <div className={`${shell} min-w-0 ${fill ? "flex h-full min-h-0 flex-col" : ""} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
        {note && (
          <span className="font-data text-[10px] uppercase tracking-wide text-mute-2">{note}</span>
        )}
      </div>
      {caption && <p className="mt-0.5 text-[10.5px] leading-snug text-mute-2">{caption}</p>}
      {/* overflow-hidden so a chart that has not re-measured yet can never push
          the dashboard into a scrollbar — the panel owns its bounds, not the
          SVG inside it */}
      <div
        className={`mt-2 min-w-0 overflow-hidden ${fill ? "min-h-0 flex-1" : ""}`}
        style={fill ? undefined : { height }}
      >
        {children}
      </div>
    </div>
  );
}

/** Spend per day. Needs at least two points — one dot is not a trend. */
export function SpendTrend({
  data,
  formatValue,
  title = "Spend over time",
  note,
  caption,
  shell,
  className,
  height,
}: {
  data: TrendPoint[];
  formatValue: (n: number) => string;
  title?: string;
  note?: string;
  caption?: string;
  shell?: string;
  className?: string;
  height?: number | "fill";
}) {
  if (data.length < 2) return null;
  return (
    <ChartCard
      title={title}
      note={note}
      caption={caption}
      shell={shell}
      className={className}
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="adSpendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--molten)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--molten)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            tickFormatter={(d: string) => d.slice(5)}
            interval="preserveStartEnd"
            minTickGap={26}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--mute-2)", fontSize: 11 }}
            itemStyle={{ color: "var(--ink)" }}
            formatter={(value) => [formatValue(Number(value)), "Spend"]}
            cursor={{ stroke: "var(--line)" }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            stroke="var(--molten)"
            strokeWidth={2}
            fill="url(#adSpendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Horizontal bars, one per campaign, ranked as passed in. */
export function CampaignBars({
  rows,
  title,
  note,
  label,
  formatValue,
  color = "var(--molten)",
  fade = false,
  shell,
  className,
  caption,
  height,
}: {
  rows: BarRow[];
  title: string;
  note?: string;
  caption?: string;
  /** Defaults to a height derived from the row count; "fill" lets the panel
   *  decide, which is what the single-screen dashboard needs. */
  height?: number | "fill";
  /** Series name in the tooltip, e.g. "Spend" / "CTR". */
  label: string;
  formatValue: (n: number) => string;
  color?: string;
  /** Step the opacity down the ranking — reads as a leaderboard. */
  fade?: boolean;
  shell?: string;
  className?: string;
}) {
  const data = rows
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .map((r) => ({ name: r.name, [BAR_KEY]: r.value as number, tone: r.tone }));
  if (data.length === 0) return null;
  const max = Math.max(...data.map((r) => r[BAR_KEY]), 1);
  return (
    <ChartCard
      title={title}
      note={note}
      caption={caption}
      shell={shell}
      className={className}
      height={height ?? Math.max(120, data.length * 30 + 24)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "var(--muted)", fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            width={118}
            tickFormatter={truncate}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={{ color: "var(--ink)" }}
            formatter={(value) => [formatValue(Number(value)), label]}
            cursor={{ fill: "var(--overlay-subtle)" }}
          />
          {/* isAnimationActive={false} is load-bearing, not a style choice.
              recharts 3.8's bar grow-in starts each rectangle at width 0, and
              Rectangle renders null at width 0 — so if the animation frame loop
              never advances (as it does not reliably here), every bar stays
              permanently invisible. A chart that always draws beats one that
              animates when it feels like it. */}
          <Bar
            dataKey={BAR_KEY}
            radius={[4, 8, 8, 4]}
            // maxBarSize, not barSize: in the single-screen dashboard a panel
            // can be shorter than 7 fixed 16px bars, and a fixed size would
            // clip rows instead of thinning them
            maxBarSize={16}
            fill={color}
            isAnimationActive={false}
          >
            {data.map((r, i) => (
              <Cell
                key={r.name}
                fill={r.tone ?? color}
                fillOpacity={r.tone || !fade ? 1 : 1 - i * 0.1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
