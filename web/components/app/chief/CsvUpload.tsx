"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  FileSpreadsheet,
  History,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  MetaCsvError,
  clearParsed,
  loadParsed,
  parseMetaCsv,
  periodOf,
  saveParsed,
  toDiagnoseMetrics,
  type ParsedCsv,
} from "./metaCsv";
import {
  getRun,
  migrateRuns,
  nextRunNumber,
  removeRun,
  runSig,
  upsertRun,
  type ChatMsg,
  type Diagnosis,
  type StoredRun,
} from "./runsStore";
import {
  CampaignTable,
  DiagnosisPanel,
  EfficiencyCharts,
  SpendCharts,
  SummaryStrip,
} from "./CsvViews";
import RecentRuns from "./RecentRuns";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ANALYSIS_KEY = "mrk18.chief.metaCsv.analysis.v2";
const RUN_TIMEOUT_MS = 150_000;

const nowISO = () => new Date().toISOString();
const fmtUploaded = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

// A run is identified by its DATASET (content signature), so re-running,
// refining, or refreshing the same data updates ONE card — never a duplicate.
// Preserves the run's number + created time when it already exists.
function writeRunFor(p: ParsedCsv, diag: Diagnosis, clar: string[], ch: ChatMsg[]): StoredRun[] {
  const id = runSig(p.fileName, p.summary.totalSpend, p.summary.campaignCount);
  const existing = getRun(id);
  return upsertRun({
    id,
    n: existing?.n ?? nextRunNumber(),
    createdAt: existing?.createdAt ?? nowISO(),
    updatedAt: nowISO(),
    fileName: p.fileName,
    currency: p.currency,
    totalSpend: p.summary.totalSpend,
    campaignCount: p.summary.campaignCount,
    refinedCount: clar.length,
    input: p,
    output: diag,
    clarifications: clar,
    chat: ch,
  });
}

/** Analytics interpreter — upload a Meta CSV, run the diagnosis, refine it in the
 *  pinned chat. Output-first results with an Input-Data drawer; every run is
 *  saved to the Recent Runs rail (Chief-scoped). Nothing auto-runs. */
export default function CsvUpload() {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [analysis, setAnalysis] = useState<Diagnosis>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [warming, setWarming] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const [clarifications, setClarifications] = useState<string[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const [runs, setRuns] = useState<StoredRun[]>([]);

  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches,
  );
  const [runsOpen, setRunsOpen] = useState(true); // wide rail expanded
  const [runsOverlay, setRunsOverlay] = useState(false); // narrow overlay
  const [inputOpen, setInputOpen] = useState(false); // input-data drawer

  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // restore dataset + live view + runs history (migrate cleans legacy duplicates)
  useEffect(() => {
    const storedParsed = loadParsed();
    if (storedParsed) setParsed(storedParsed);
    setRuns(migrateRuns());
    try {
      const raw = localStorage.getItem(ANALYSIS_KEY);
      if (raw) {
        const a = JSON.parse(raw) as { diagnosis: Diagnosis; clarifications?: string[]; chat?: ChatMsg[] };
        setAnalysis(a.diagnosis ?? null);
        setClarifications(Array.isArray(a.clarifications) ? a.clarifications : []);
        setChat(Array.isArray(a.chat) ? a.chat : []);
      }
    } catch {}
  }, []);

  // persist the live view + keep the current dataset's run in sync — keyed by the
  // dataset signature, so it's one card that updates (never a new duplicate)
  useEffect(() => {
    if (analysis || clarifications.length || chat.length) {
      try {
        localStorage.setItem(ANALYSIS_KEY, JSON.stringify({ diagnosis: analysis, clarifications, chat }));
      } catch {}
    }
    if (parsed && analysis) {
      setRuns(writeRunFor(parsed, analysis, clarifications, chat));
    }
  }, [analysis, clarifications, chat, parsed]);

  useEffect(() => {
    if (!analyzing) {
      setWarming(false);
      return;
    }
    const t = setTimeout(() => setWarming(true), 12_000);
    return () => clearTimeout(t);
  }, [analyzing]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, analyzing]);

  // clear the live working view (analysis + conversation); KEEP history + dataset
  const clearConversation = useCallback(() => {
    setAnalysis(null);
    setClarifications([]);
    setChat([]);
    setAnalysisError(null);
    setSentNote(null);
    setInputOpen(false);
    try {
      localStorage.removeItem(ANALYSIS_KEY);
    } catch {}
  }, []);

  // save the CURRENT dataset to Recent Runs before it's discarded (replace/clear),
  // so replacing a CSV never loses the previous one — analysed or not.
  const snapshotCurrentRun = useCallback(() => {
    if (!parsed) return;
    setRuns(writeRunFor(parsed, analysis, clarifications, chat));
  }, [parsed, analysis, clarifications, chat]);

  const resetAll = useCallback(() => {
    snapshotCurrentRun();
    setParsed(null);
    setError(null);
    clearConversation();
    clearParsed();
    if (fileInput.current) fileInput.current.value = "";
  }, [snapshotCurrentRun, clearConversation]);

  const handleFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      setError(null);
      if (!/\.csv$/i.test(file.name)) {
        setError("Only .csv files are accepted — export from Meta Ads Manager as CSV.");
        return;
      }
      if (file.size === 0) {
        setError("That file is empty.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("File is over 10MB — export a shorter date range.");
        return;
      }
      const hadData = !!parsed;
      setParsing(true);
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: "greedy",
        complete: (res) => {
          setParsing(false);
          let p: ParsedCsv;
          try {
            p = parseMetaCsv(res.data, res.meta.fields ?? [], file.name);
          } catch (e) {
            setError(e instanceof MetaCsvError ? e.message : "Could not parse that CSV.");
            return;
          }
          if (
            hadData &&
            !window.confirm("Replace the loaded data? Your current data is saved to Recent Runs first.")
          ) {
            return;
          }
          snapshotCurrentRun();
          clearConversation();
          setParsed(p);
          saveParsed(p);
        },
        error: () => {
          setParsing(false);
          setError("Could not read that file — is it a valid CSV?");
        },
      });
      // allow re-picking the same file next time
      if (fileInput.current) fileInput.current.value = "";
    },
    [parsed, clearConversation, snapshotCurrentRun],
  );

  // the ONLY place the interpreter is called (initial run + every refine)
  const runDiagnose = useCallback(
    async (clar: string[], fromChat: boolean) => {
      if (!parsed) return;
      setAnalyzing(true);
      setAnalysisError(null);
      const { metrics, sent } = toDiagnoseMetrics(parsed);
      setSentNote(
        sent < parsed.campaigns.length
          ? `Reading the top ${sent} of ${parsed.campaigns.length} campaigns by spend (size cap).`
          : null,
      );
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
      try {
        const res = await fetch("/api/analytics/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics, period: periodOf(parsed), clarifications: clar }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAnalysisError(body?.error || "Analysis failed — try again.");
        } else {
          const diag = (body?.diagnosis ?? null) as Diagnosis;
          setAnalysis(diag);
          if (fromChat && diag?.headline) {
            setChat((m) => [...m, { id: `c-${Date.now()}`, role: "cmo", text: diag.headline! }]);
          }
        }
      } catch (e) {
        clearTimeout(timer);
        setAnalysisError(
          e instanceof DOMException && e.name === "AbortError"
            ? "The analysis engine is still warming up (a cold start can take a minute or two). Try again — it's usually ready on the second attempt."
            : "Couldn't reach the backend — is it awake?",
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [parsed],
  );

  const runAnalysis = useCallback(() => {
    if (!analyzing) runDiagnose(clarifications, false);
  }, [analyzing, clarifications, runDiagnose]);

  const refine = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || !parsed || !analysis || analyzing) return;
      const next = [...clarifications, text];
      setClarifications(next);
      setChat((m) => [...m, { id: `u-${Date.now()}`, role: "you", text }]);
      setDraft("");
      runDiagnose(next, true);
    },
    [analysis, analyzing, clarifications, parsed, runDiagnose],
  );

  const selectRun = useCallback((id: string) => {
    const r = getRun(id);
    if (!r) return;
    setParsed(r.input); // the loaded dataset's signature === r.id → it's the active card
    saveParsed(r.input);
    setAnalysis(r.output);
    setClarifications(r.clarifications);
    setChat(r.chat);
    setAnalysisError(null);
    setInputOpen(false);
    setRunsOverlay(false);
  }, []);

  const deleteRun = useCallback((id: string) => {
    setRuns(removeRun(id));
  }, []);

  // which card is "active" = the run whose dataset is currently loaded
  const activeId = parsed
    ? runSig(parsed.fileName, parsed.summary.totalSpend, parsed.summary.campaignCount)
    : null;

  const runButton = (compact?: boolean) => (
    <button
      onClick={runAnalysis}
      disabled={!parsed || analyzing}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-molten font-bold text-white transition hover:opacity-90 disabled:opacity-60 ${
        compact ? "px-3.5 py-1.5 text-[12px]" : "px-4 py-2 text-[12.5px]"
      }`}
    >
      {analyzing ? (
        <>
          <Loader2 size={13} className="animate-spin" aria-hidden /> Analysing…
        </>
      ) : (
        <>
          <Sparkles size={13} aria-hidden /> {analysis ? "Re-run" : "Run analysis"}
        </>
      )}
    </button>
  );

  const runStatus = analyzing
    ? warming
      ? "Still warming the analysis engine up — a cold start can take a minute or two…"
      : "Reading your numbers…"
    : (sentNote ?? "Nothing runs automatically — analysis starts only when you say so.");

  const inputData = () => (
    <>
      <SummaryStrip parsed={parsed!} />
      <div className="mt-3">
        <CampaignTable parsed={parsed!} />
      </div>
    </>
  );

  return (
    <div className="flex h-full">
      {/* ── MAIN COLUMN ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="dash-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 py-6">
            {/* header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-[28px] leading-none text-ink">Analytics interpreter</h1>
                <p className="mt-1.5 text-[12.5px] text-mute">
                  Upload your Meta ads export — see the numbers, run the diagnosis, then refine it by
                  answering your CMO below.
                </p>
              </div>
              {narrow && (
                <button
                  onClick={() => setRunsOverlay(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-ink"
                >
                  <History size={14} aria-hidden /> Runs
                  {runs.length > 0 && (
                    <span className="rounded-full bg-molten/15 px-1.5 text-[10px] font-bold text-molten">
                      {runs.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {error && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-bad">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            {!parsed ? (
              /* EMPTY / PARSING */
              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileSpreadsheet size={15} className="text-molten" aria-hidden />
                  <span className="text-[13px] font-semibold text-ink">Meta ads — CSV upload</span>
                </div>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${
                    dragOver ? "border-molten/60 bg-molten/[0.05]" : "border-line hover:border-molten/40"
                  }`}
                >
                  {parsing ? (
                    <>
                      <Loader2 size={20} className="animate-spin text-molten" aria-hidden />
                      <span className="text-[13px] font-semibold text-ink">Parsing…</span>
                    </>
                  ) : (
                    <>
                      <Upload size={20} className="text-mute-2" aria-hidden />
                      <span className="text-[13px] font-semibold text-ink">Upload Meta CSV</span>
                      <span className="text-[12px] text-mute">
                        Drag &amp; drop the Ads Manager export here, or click to browse · .csv, up to 10MB
                      </span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <>
                {/* FILE-INFO BAR + prominent Replace */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <FileSpreadsheet size={14} className="text-molten" aria-hidden />
                      <span className="max-w-[220px] truncate" title={parsed.fileName}>
                        {parsed.fileName}
                      </span>
                    </span>
                    <span className="text-mute">{parsed.rowCount.toLocaleString()} rows</span>
                    {parsed.summary.dateFrom && parsed.summary.dateTo && (
                      <span className="text-mute">
                        {parsed.summary.dateFrom} → {parsed.summary.dateTo}
                      </span>
                    )}
                    <span className="text-mute-2">uploaded {fmtUploaded(parsed.uploadedAt)}</span>
                    {parsed.skipped > 0 && (
                      <span className="text-watch">
                        {parsed.skipped} skipped
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInput.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:opacity-90"
                    >
                      <RefreshCw size={13} aria-hidden /> Replace CSV
                    </button>
                    <button
                      onClick={resetAll}
                      aria-label="Clear uploaded data"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-mute-2 transition-colors hover:text-ink"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                </div>

                {!analysis ? (
                  /* PRE-ANALYSIS PREVIEW */
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    {!analyzing && (
                      <p className="mb-3 flex items-center gap-2 rounded-xl border border-watch/30 bg-watch/[0.08] px-3 py-2 text-[12.5px] font-semibold text-watch">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-watch" />
                        Data loaded — analysis not run yet.
                      </p>
                    )}
                    <SummaryStrip parsed={parsed} />
                    <div className="mt-3">
                      <SpendCharts parsed={parsed} />
                    </div>
                    <div className="mt-3">
                      <CampaignTable parsed={parsed} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11.5px] text-mute-2">{runStatus}</span>
                      {runButton()}
                    </div>
                    {analysisError && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-bad">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        {analysisError}
                      </p>
                    )}
                  </div>
                ) : (
                  /* RESULTS — output first, input at the side */
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11.5px] text-mute-2">{runStatus}</span>
                      {runButton(true)}
                    </div>
                    {analysisError && (
                      <p className="mb-3 flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-bad">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        {analysisError}
                      </p>
                    )}

                    {narrow ? (
                      <div className="space-y-3">
                        {analysis && <DiagnosisPanel analysis={analysis} />}
                        <SpendCharts parsed={parsed} />
                        <EfficiencyCharts parsed={parsed} />
                        <details className="rounded-2xl border border-line bg-surface-2/30">
                          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] font-semibold text-ink">
                            View input data
                          </summary>
                          <div className="border-t border-line p-3.5">
                            {inputData()}
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1 space-y-3">
                          {analysis && <DiagnosisPanel analysis={analysis} />}
                          <SpendCharts parsed={parsed} />
                          <EfficiencyCharts parsed={parsed} />
                        </div>
                        {inputOpen ? (
                          <aside className="w-[340px] shrink-0 self-start rounded-2xl border border-line bg-surface-2/30 p-3.5">
                            <div className="mb-2.5 flex items-center justify-between">
                              <span className="text-[12px] font-bold text-ink">Input data</span>
                              <button
                                onClick={() => setInputOpen(false)}
                                aria-label="Hide input data"
                                className="grid h-6 w-6 place-items-center rounded-md text-mute-2 transition-colors hover:text-ink"
                              >
                                <PanelRightClose size={14} aria-hidden />
                              </button>
                            </div>
                            {inputData()}
                          </aside>
                        ) : (
                          <button
                            onClick={() => setInputOpen(true)}
                            aria-label="View input data"
                            className="flex shrink-0 flex-col items-center gap-2 self-start rounded-2xl border border-line bg-surface-2/40 px-2 py-3 text-mute transition-colors hover:text-ink"
                          >
                            <PanelRightOpen size={15} aria-hidden />
                            <span className="text-[11px] font-semibold tracking-wide [writing-mode:vertical-rl]">
                              Input data
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* pinned refine chat */}
        {parsed && (
          <div className="shrink-0 bg-bg">
            <div className="mx-auto w-full max-w-6xl px-5 pb-4 pt-1">
              <div className="rounded-2xl border border-line bg-surface transition-colors focus-within:border-molten/40">
                {chat.length > 0 && (
                  <div ref={threadRef} className="dash-scroll max-h-52 space-y-2.5 overflow-y-auto border-b border-line p-3.5">
                    {chat.map((m) => (
                      <div key={m.id} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                            m.role === "cmo"
                              ? "font-claude-serif rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                              : "rounded-tr-sm bg-surface-2 text-ink"
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    ))}
                    {analyzing && chat.length > 0 && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-molten/20 bg-molten/[0.07] px-3.5 py-2 text-[12px] text-mute">
                          <span className="flex gap-1" aria-hidden>
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten" />
                          </span>
                          re-reading your numbers…
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 px-4 py-3.5">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        refine(draft);
                      }
                    }}
                    disabled={!analysis || analyzing}
                    placeholder={
                      analysis
                        ? "Answer your CMO — e.g. “a result means a completed purchase”"
                        : "Run the analysis first, then answer your CMO here"
                    }
                    style={{ outline: "none" }}
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-mute-2 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={() => refine(draft)}
                    disabled={!draft.trim() || !analysis || analyzing}
                    aria-label="Send to your CMO"
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors ${
                      draft.trim() && analysis ? "text-molten hover:text-ember" : "text-mute-2"
                    } disabled:text-mute-2`}
                  >
                    {analyzing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CornerDownLeft size={15} aria-hidden />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RECENT RUNS RAIL (wide) ── */}
      {!narrow &&
        (runsOpen ? (
          <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-[var(--sidebar)]">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                <History size={14} aria-hidden /> Recent runs
              </span>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-molten/12 px-1.5 py-0.5 text-[10px] font-bold text-molten">{runs.length}</span>
                <button
                  onClick={() => setRunsOpen(false)}
                  aria-label="Collapse recent runs"
                  className="grid h-6 w-6 place-items-center rounded-md text-mute-2 transition-colors hover:text-ink"
                >
                  <ChevronRight size={14} aria-hidden />
                </button>
              </div>
            </div>
            <div className="dash-scroll flex-1 overflow-y-auto p-3">
              <RecentRuns runs={runs} activeId={activeId} onSelect={selectRun} onRemove={deleteRun} />
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setRunsOpen(true)}
            aria-label="Show recent runs"
            className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-[var(--sidebar)] py-3 text-mute transition-colors hover:text-ink"
          >
            <ChevronLeft size={14} aria-hidden />
            <History size={15} aria-hidden />
            {runs.length > 0 && (
              <span className="rounded-full bg-molten/15 px-1.5 py-0.5 text-[10px] font-bold text-molten">{runs.length}</span>
            )}
            <span className="text-[10px] tracking-wide [writing-mode:vertical-rl]">Recent runs</span>
          </button>
        ))}

      {/* ── RECENT RUNS OVERLAY (narrow) ── */}
      {narrow && runsOverlay && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button className="absolute inset-0 bg-[rgba(0,0,0,0.4)]" aria-label="Close recent runs" onClick={() => setRunsOverlay(false)} />
          <aside className="relative z-10 flex h-full w-[86%] max-w-sm flex-col border-l border-line bg-[var(--sidebar)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <History size={15} aria-hidden /> Recent runs ({runs.length})
              </span>
              <button
                onClick={() => setRunsOverlay(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-mute-2 transition-colors hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="dash-scroll flex-1 overflow-y-auto p-3">
              <RecentRuns runs={runs} activeId={activeId} onSelect={selectRun} onRemove={deleteRun} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
