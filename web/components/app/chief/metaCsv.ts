/** Meta Ads Manager CSV → normalized campaign metrics, entirely client-side.
 *  Tolerant of currency variants ("Amount spent (INR)"/"(USD)"), column order,
 *  and per-day exports (rows are aggregated per campaign). Pure logic — no React. */

export type CampaignAgg = {
  name: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  ctr: number | null; // %
  cpc: number | null; // in the export's currency
};

export type DailyPoint = { date: string; spend: number; clicks: number };

export type CsvSummary = {
  totalSpend: number;
  impressions: number;
  clicks: number;
  avgCtr: number | null;
  avgCpc: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  campaignCount: number;
};

export type ParsedCsv = {
  fileName: string;
  uploadedAt: string; // ISO
  currency: string; // "₹" | "$" | "€" | "£" | ""
  campaigns: CampaignAgg[];
  daily: DailyPoint[]; // per-day spend/clicks — empty when the export has no date column
  summary: CsvSummary;
  rowCount: number; // data rows seen
  skipped: number; // malformed / unusable rows dropped
};

type Field =
  | "campaign"
  | "adset"
  | "ad"
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "results"
  | "ctr"
  | "cpc"
  | "date"
  | "dateEnd"
  | "currency";

const normHeader = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();

/** Map one normalized header to a known field (first match wins per header). */
function classify(h: string): Field | null {
  if (/^(campaign name|campaign)$/.test(h)) return "campaign";
  if (/^(ad set name|adset name|ad set|adset)$/.test(h)) return "adset";
  if (/^ad name$/.test(h)) return "ad";
  if (/^amount spent( \(.+\))?$|^spend$|^cost$/.test(h)) return "spend";
  if (/^impressions$/.test(h)) return "impressions";
  if (/^reach$/.test(h)) return "reach";
  if (/^link clicks$|^clicks( \(all\))?$/.test(h)) return "clicks";
  if (/^results?$|^conversions?$|^purchases$|^leads$/.test(h)) return "results";
  if (/^ctr( \(.+\))?$/.test(h)) return "ctr";
  if (/^cpc( \(.+\))?$/.test(h)) return "cpc";
  if (/^(day|date|reporting starts)$/.test(h)) return "date";
  if (/^reporting ends$/.test(h)) return "dateEnd";
  if (/^currency$/.test(h)) return "currency";
  return null;
}

/** "₹1,234.56" / "12.3%" / "1,204" → number; junk → null. */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/[₹$€£\s]/g, "")
    .replace(/,/g, "")
    .replace(/%$/, "")
    .trim();
  if (!s || s === "-" || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function currencyFromHeader(h: string): string {
  if (/\(inr\)/.test(h)) return "₹";
  if (/\(usd\)/.test(h)) return "$";
  if (/\(eur\)/.test(h)) return "€";
  if (/\(gbp\)/.test(h)) return "£";
  return "";
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

type Acc = {
  spend: number;
  spendSeen: boolean;
  impressions: number;
  imprSeen: boolean;
  reach: number;
  reachSeen: boolean;
  clicks: number;
  clicksSeen: boolean;
  results: number;
  resultsSeen: boolean;
  ctrSum: number;
  ctrN: number;
  cpcSum: number;
  cpcN: number;
};

export class MetaCsvError extends Error {}

/** rows = PapaParse output with `header: true` (raw, un-normalized keys). */
export function parseMetaCsv(
  rows: Record<string, string>[],
  rawHeaders: string[],
  fileName: string,
): ParsedCsv {
  if (!rawHeaders.length) throw new MetaCsvError("The file has no header row.");
  if (!rows.length) throw new MetaCsvError("The file has a header but no data rows.");

  // header → field map (first header wins per field; keeps "Campaign name" over "Ad name")
  const byField = new Map<Field, string>();
  let currency = "";
  for (const raw of rawHeaders) {
    const h = normHeader(raw ?? "");
    const f = classify(h);
    if (f && !byField.has(f)) byField.set(f, raw);
    if (f === "spend" || f === "cpc") currency = currency || currencyFromHeader(h);
  }

  const nameHeader = byField.get("campaign") ?? byField.get("adset") ?? byField.get("ad");
  const hasMetric = ["spend", "impressions", "clicks", "results"].some((f) =>
    byField.has(f as Field),
  );
  if (!nameHeader || !hasMetric) {
    throw new MetaCsvError(
      "This doesn't look like a Meta Ads export — need a campaign/ad set name column plus at least one metric (Amount spent, Impressions, Clicks or Results).",
    );
  }

  const get = (row: Record<string, string>, f: Field) => {
    const h = byField.get(f);
    return h ? row[h] : undefined;
  };

  const acc = new Map<string, Acc>();
  const byDay = new Map<string, { spend: number; clicks: number }>();
  let skipped = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const row of rows) {
    const name = String(row[nameHeader] ?? "").trim();
    const spend = toNum(get(row, "spend"));
    const impressions = toNum(get(row, "impressions"));
    const reach = toNum(get(row, "reach"));
    const clicks = toNum(get(row, "clicks"));
    const results = toNum(get(row, "results"));
    const ctr = toNum(get(row, "ctr"));
    const cpc = toNum(get(row, "cpc"));

    // a usable row = a name + at least one real number
    if (!name || [spend, impressions, clicks, results].every((v) => v == null)) {
      skipped += 1;
      continue;
    }

    if (!currency) {
      const c = String(get(row, "currency") ?? "").trim().toUpperCase();
      if (c && CURRENCY_SYMBOL[c]) currency = CURRENCY_SYMBOL[c];
    }

    // Meta dates are YYYY-MM-DD → lexicographic min/max is chronological
    const d1 = String(get(row, "date") ?? "").trim();
    const d2 = String(get(row, "dateEnd") ?? "").trim() || d1;
    if (/^\d{4}-\d{2}-\d{2}/.test(d1)) {
      if (!dateFrom || d1 < dateFrom) dateFrom = d1.slice(0, 10);
      if (!dateTo || d2 > dateTo) dateTo = d2.slice(0, 10);
      const day = d1.slice(0, 10);
      const dv = byDay.get(day) ?? { spend: 0, clicks: 0 };
      if (spend != null) dv.spend += spend;
      if (clicks != null) dv.clicks += clicks;
      byDay.set(day, dv);
    }

    const a =
      acc.get(name) ??
      ({
        spend: 0, spendSeen: false,
        impressions: 0, imprSeen: false,
        reach: 0, reachSeen: false,
        clicks: 0, clicksSeen: false,
        results: 0, resultsSeen: false,
        ctrSum: 0, ctrN: 0, cpcSum: 0, cpcN: 0,
      } as Acc);
    if (spend != null) { a.spend += spend; a.spendSeen = true; }
    if (impressions != null) { a.impressions += impressions; a.imprSeen = true; }
    if (reach != null) { a.reach += reach; a.reachSeen = true; }
    if (clicks != null) { a.clicks += clicks; a.clicksSeen = true; }
    if (results != null) { a.results += results; a.resultsSeen = true; }
    if (ctr != null) { a.ctrSum += ctr; a.ctrN += 1; }
    if (cpc != null) { a.cpcSum += cpc; a.cpcN += 1; }
    acc.set(name, a);
  }

  if (acc.size === 0) {
    throw new MetaCsvError(
      `No usable rows found — ${skipped} malformed row${skipped === 1 ? "" : "s"} skipped.`,
    );
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const campaigns: CampaignAgg[] = [...acc.entries()].map(([name, a]) => {
    // derive rates from totals when possible; fall back to the export's own columns
    const ctr =
      a.imprSeen && a.clicksSeen && a.impressions > 0
        ? round2((a.clicks / a.impressions) * 100)
        : a.ctrN > 0
          ? round2(a.ctrSum / a.ctrN)
          : null;
    const cpc =
      a.spendSeen && a.clicksSeen && a.clicks > 0
        ? round2(a.spend / a.clicks)
        : a.cpcN > 0
          ? round2(a.cpcSum / a.cpcN)
          : null;
    return {
      name,
      spend: a.spendSeen ? round2(a.spend) : null,
      impressions: a.imprSeen ? a.impressions : null,
      reach: a.reachSeen ? a.reach : null,
      clicks: a.clicksSeen ? a.clicks : null,
      results: a.resultsSeen ? round2(a.results) : null,
      ctr,
      cpc,
    };
  });
  campaigns.sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0));

  const totalSpend = round2(campaigns.reduce((n, c) => n + (c.spend ?? 0), 0));
  const impressions = campaigns.reduce((n, c) => n + (c.impressions ?? 0), 0);
  const clicks = campaigns.reduce((n, c) => n + (c.clicks ?? 0), 0);
  const ctrVals = campaigns.map((c) => c.ctr).filter((v): v is number => v != null);
  const cpcVals = campaigns.map((c) => c.cpc).filter((v): v is number => v != null);
  const avgCtr =
    impressions > 0 && clicks > 0
      ? round2((clicks / impressions) * 100)
      : ctrVals.length
        ? round2(ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length)
        : null;
  const avgCpc =
    totalSpend > 0 && clicks > 0
      ? round2(totalSpend / clicks)
      : cpcVals.length
        ? round2(cpcVals.reduce((a, b) => a + b, 0) / cpcVals.length)
        : null;

  const daily: DailyPoint[] = [...byDay.entries()]
    .map(([date, v]) => ({ date, spend: round2(v.spend), clicks: v.clicks }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    fileName,
    uploadedAt: new Date().toISOString(),
    currency,
    campaigns,
    daily,
    summary: {
      totalSpend,
      impressions,
      clicks,
      avgCtr,
      avgCpc,
      dateFrom,
      dateTo,
      campaignCount: campaigns.length,
    },
    rowCount: rows.length,
    skipped,
  };
}

/** The backend's DiagnoseBody.metrics shape, bounded well under its 200k-char
 *  serialized cap (campaigns are already sorted by spend, so trimming keeps the
 *  ones that matter). Returns the payload + how many campaigns were sent. */
export function toDiagnoseMetrics(parsed: ParsedCsv): { metrics: Record<string, unknown>; sent: number } {
  const strip = (c: CampaignAgg) =>
    Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null));
  let list = parsed.campaigns;
  let metrics = { total_spend: parsed.summary.totalSpend, campaigns: list.map(strip) };
  while (list.length > 20 && JSON.stringify(metrics).length > 180_000) {
    list = list.slice(0, Math.floor(list.length / 2));
    metrics = { total_spend: parsed.summary.totalSpend, campaigns: list.map(strip) };
  }
  return { metrics, sent: list.length };
}

export function periodOf(parsed: ParsedCsv): string | null {
  const { dateFrom, dateTo } = parsed.summary;
  if (dateFrom && dateTo) return dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;
  return null;
}

/* ── refresh persistence (quota-guarded: rows capped, full data lives in memory) ── */

const STORE_KEY = "mrk18.chief.metaCsv.v1";
export const STORED_ROW_CAP = 400;

export function saveParsed(p: ParsedCsv): void {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ ...p, campaigns: p.campaigns.slice(0, STORED_ROW_CAP) }),
    );
  } catch {
    /* quota exceeded → refresh just won't restore; the live session is unaffected */
  }
}

export function loadParsed(): ParsedCsv | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ParsedCsv;
    if (!Array.isArray(p?.campaigns) || !p?.summary) return null;
    if (!Array.isArray(p.daily)) p.daily = []; // data stored before charts existed
    return p;
  } catch {
    return null;
  }
}

export function clearParsed(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
}
