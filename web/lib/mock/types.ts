/** Shared vocabulary for every dashboard surface. */

export type Verdict = "healthy" | "watch" | "leaking";
export type Trend = "up" | "down" | "flat";
export type Confidence = "high" | "medium" | "low";

export interface WeekVerdict {
  /** Plain-language decision headline — "your CMO is calling", in text. */
  headline: string;
  sub: string;
  confidence: Confidence;
  dateRange: string;
}

export interface HeroNumber {
  label: string;
  value: number;
  target: number;
  unit: string;
  trendPct: number; // vs last period
  status: Verdict;
  takeaway: string;
}

export interface NextMove {
  id: string;
  title: string;
  why: string;
  metricLabel: string;
  metricValue: string;
  impact: string; // expected effect, plain language
}

export interface LeakAlert {
  id: string;
  channel: string;
  monthlyWaste: number;
  conversions: number;
  severity: Extract<Verdict, "watch" | "leaking">;
  summary: string;
  evidence: string[];
  fix: string;
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  /** render value: "inr" → ₹ compact, "pct" → %, "num" → plain */
  kind: "inr" | "pct" | "num";
  target: number;
  trendPct: number;
  /** true when a downward move is the good direction (e.g. CAC, spend) */
  lowerIsBetter: boolean;
  status: Verdict;
}

export interface ActivityResultPoint {
  week: string;
  activity: number; // posts + campaigns + emails shipped
  results: number; // new paying customers
}

export interface LeakRow {
  id: string;
  channel: string;
  spend: number;
  conversions: number;
  cac: number | null; // null when zero conversions
  verdict: Verdict;
  wastedPerMonth: number;
  why: string;
  fix: string;
}

export interface ChannelSeriesPoint {
  label: string;
  /** effort shipped that period (neutral) */
  activity: number;
  /** paying customers attributed (the result) */
  results: number;
  spend: number;
}

export interface Channel {
  id: string;
  name: string;
  kind: "paid" | "organic" | "owned";
  spend: number;
  conversions: number;
  cac: number | null;
  verdict: Verdict;
  takeaway: string;
  /** last 12 weeks, oldest first */
  series: ChannelSeriesPoint[];
}

export interface FunnelStage {
  id: string;
  name: string;
  count: number;
  /** conversion from previous stage; null for the first stage */
  convFromPrev: number | null;
  verdict: Verdict;
  leak: string | null; // plain-language leak at the joint AFTER this stage
  detail: {
    takeaway: string;
    evidence: string[];
    fix: string;
  };
}

export interface ReportSection {
  kind: "worked" | "leaking" | "next";
  title: string;
  body: string[];
  metricLabel: string;
  metricValue: string;
  chart: { label: string; value: number }[];
  chartTakeaway: string;
}

export interface WeeklyReport {
  id: string;
  week: string;
  verdict: string;
  confidence: Confidence;
  reviewed: boolean;
  sections: ReportSection[];
}

export type MoveStatus = "todo" | "doing" | "done";

export interface ExecuteItem {
  id: string;
  title: string;
  detail: string;
  metricLabel: string;
  metricNow: string;
  metricGoal: string;
  status: MoveStatus;
  source: "cmo" | "you";
  eta: string;
}

export interface Connection {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  lastSync: string | null;
  unlocks: string;
}
