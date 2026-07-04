/** Analytics-interpreter run history — Chief-scoped, localStorage-backed.
 *  Each run keeps the input dataset snapshot + the interpreter output + the
 *  refine conversation, so clicking a card restores the whole view. Newest
 *  first, capped, quota-safe. Pure logic — no React. */

import { STORED_ROW_CAP, type ParsedCsv } from "./metaCsv";

export type Diagnosis = {
  headline?: string;
  working?: string[];
  leaking?: string[];
  scale?: string[];
  cut?: string[];
  next_move?: string;
} | null;

export type ChatMsg = { id: string; role: "you" | "cmo"; text: string };

export type StoredRun = {
  id: string;
  n: number; // human run number (monotonic)
  createdAt: string; // ISO — when the run was first created
  updatedAt: string; // ISO — last refine
  fileName: string;
  currency: string;
  totalSpend: number;
  campaignCount: number;
  refinedCount: number; // how many clarifications folded in
  input: ParsedCsv; // dataset snapshot (campaigns trimmed for storage)
  output: Diagnosis;
  clarifications: string[];
  chat: ChatMsg[];
};

const KEY = "mrk18.chief.runs.v1";
const CAP = 20;

export function listRuns(): StoredRun[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? (v as StoredRun[]) : [];
  } catch {
    return [];
  }
}

/** Next human run number = max existing + 1 (survives eviction gaps). */
export function nextRunNumber(): number {
  return listRuns().reduce((mx, r) => Math.max(mx, r.n), 0) + 1;
}

/** A run's stable identity = its DATASET (content signature). The same data —
 *  re-run, refined, refreshed, or re-uploaded — always resolves to one card. */
export function runSig(fileName: string, totalSpend: number, campaignCount: number): string {
  return `${fileName}::${Math.round(totalSpend)}::${campaignCount}`;
}

/** One-time cleanup, safe to run every load: re-key legacy runs (old random ids)
 *  to the content signature and drop duplicates of the same dataset, keeping the
 *  newest (list is newest-first). Fixes the "same dataset spawned N cards" mess. */
export function migrateRuns(): StoredRun[] {
  const raw = listRuns();
  const seen = new Set<string>();
  const out: StoredRun[] = [];
  let changed = false;
  for (const r of raw) {
    const key = runSig(r.fileName, r.totalSpend, r.campaignCount);
    if (seen.has(key)) {
      changed = true; // an older duplicate of the same dataset — drop it
      continue;
    }
    seen.add(key);
    if (r.id !== key) {
      changed = true;
      out.push({ ...r, id: key });
    } else {
      out.push(r);
    }
  }
  if (changed) write(out);
  return changed ? listRuns() : raw;
}

function write(runs: StoredRun[]): void {
  let list = runs.slice(0, CAP);
  // quota-safe: shed the oldest run until it fits under the ~5MB localStorage cap
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) {
        try {
          localStorage.removeItem(KEY);
        } catch {}
        return;
      }
      list = list.slice(0, -1);
    }
  }
}

/** Insert or update a run, moving it to the front (newest / most-recently refined). */
export function upsertRun(run: StoredRun): StoredRun[] {
  const compact: StoredRun = {
    ...run,
    input: { ...run.input, campaigns: run.input.campaigns.slice(0, STORED_ROW_CAP) },
  };
  const rest = listRuns().filter((r) => r.id !== run.id);
  write([compact, ...rest]);
  return listRuns();
}

export function getRun(id: string): StoredRun | null {
  return listRuns().find((r) => r.id === id) ?? null;
}

export function removeRun(id: string): StoredRun[] {
  write(listRuns().filter((r) => r.id !== id));
  return listRuns();
}
