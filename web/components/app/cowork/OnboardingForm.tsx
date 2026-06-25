"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Building2,
  Check,
  Lock,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { ChipSelect, Field, Segmented, Select, TextArea, TextInput } from "./fields";
import { RightPanelSlot } from "../right-panel-slot";

/** The typed payload that seeds the founder's CMO brain. */
export interface BrainSeed {
  domain: string;
  productName: string;
  oneLiner: string;
  targetCustomer: string;
  usp: string;
  problem: string;
  competitors: string[];
  stage: "" | "pre" | "early" | "scaling";
  mrr: string;
  monthlySpend: string;
  voice: string[];
  goal: "" | "awareness" | "signups" | "revenue" | "retention";
  channels: string[];
  languages: string[];
  consent: boolean;
}

const EMPTY: BrainSeed = {
  domain: "",
  productName: "",
  oneLiner: "",
  targetCustomer: "",
  usp: "",
  problem: "",
  competitors: [],
  stage: "",
  mrr: "",
  monthlySpend: "",
  voice: [],
  goal: "",
  channels: [],
  languages: ["English"],
  consent: false,
};

const VOICES = ["Bold", "Calm", "Witty", "Technical", "Warm", "Contrarian", "Premium", "Straight-talking"];
const CHANNELS = ["LinkedIn", "X / Twitter", "Instagram", "YouTube", "SEO / Blog", "Email", "WhatsApp", "Reddit"];
// the three your CMO can actually publish to (the backend's target_platforms)
const PUBLISHABLE = ["LinkedIn", "X / Twitter", "Instagram"];
const LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Bengali", "Marathi", "Kannada", "Gujarati"];

const STAGES = [
  { value: "pre", label: "Pre-revenue" },
  { value: "early", label: "Early revenue" },
  { value: "scaling", label: "Scaling" },
];
const GOALS = [
  { value: "awareness", label: "Awareness" },
  { value: "signups", label: "Signups" },
  { value: "revenue", label: "Revenue" },
  { value: "retention", label: "Retention" },
];

const STEPS = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "edge", label: "Customer & edge", icon: Target },
  { id: "market", label: "Market", icon: TrendingUp },
  { id: "brand", label: "Brand & goals", icon: Sparkles },
  { id: "review", label: "Review", icon: Check },
] as const;

const urlOk = (v: string) => /^([\w-]+\.)+[\w-]{2,}(\/\S*)?$/.test(v.replace(/^https?:\/\//, "").trim());

// Backend contract field names → the labels the founder actually saw on the form,
// so a server-side rejection reads like "Target customer: …" not "icp: …".
const FIELD_LABELS: Record<string, string> = {
  company_name: "Product / service name",
  website: "Website",
  product_description: "Description",
  icp: "Target customer",
  top_competitors: "Competitors",
  tone: "Brand voice",
  primary_goal: "Primary goal",
  monthly_spend_inr: "Monthly spend",
  target_platforms: "Channels",
  consent_given: "Consent",
  consent_text_version: "Consent",
};

/** "icp: String should have at least 10 characters" → "Target customer: String should…" */
function prettyField(item: string): string {
  const idx = item.indexOf(":");
  const field = (idx === -1 ? item : item.slice(0, idx)).trim();
  const label = FIELD_LABELS[field] ?? field;
  return idx === -1 ? label : `${label}${item.slice(idx)}`;
}

// Client mirror of the server's Layer-1 gibberish heuristics (intake_quality.py):
// instant inline feedback so keyboard-mashing is caught on the step, not at submit.
// The server stays authoritative (it also runs the AI coherence gate).
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const KB_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function maxConsonantRun(w: string): number {
  let run = 0;
  let best = 0;
  for (const c of w) {
    if (VOWELS.has(c)) run = 0;
    else best = Math.max(best, ++run);
  }
  return best;
}
function implausibleWord(word: string): boolean {
  const w = word.toLowerCase();
  if (w.length < 4) return false;
  const vowels = [...w].filter((c) => VOWELS.has(c)).length;
  if (vowels / w.length < 0.2) return true;
  return maxConsonantRun(w) >= 5;
}
function hasKeyboardWalk(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  for (const row of KB_ROWS) {
    for (let i = 0; i <= row.length - 4; i++) {
      const seg = row.slice(i, i + 4);
      if (t.includes(seg) || t.includes([...seg].reverse().join(""))) return true;
    }
  }
  return false;
}
/** Reason a free-text answer looks like gibberish, or null if it reads fine. */
function gibberishReason(text: string): string | null {
  const words = text.match(/[A-Za-z]+/g) ?? [];
  if (words.length < 2) return "Write a real phrase, not a single code-like token.";
  if (hasKeyboardWalk(text)) return "That looks like random keyboard input.";
  const longish = words.filter((w) => w.length >= 4);
  if (longish.length && longish.filter(implausibleWord).length / longish.length > 0.5)
    return "That doesn't read like real words — write a genuine answer.";
  return null;
}

function validate(step: number, d: BrainSeed): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!d.domain.trim()) e.domain = "Your website is how the CMO learns your market.";
    else if (!urlOk(d.domain)) e.domain = "That doesn't look like a domain — e.g. arcinvoicing.in";
    if (!d.productName.trim()) e.productName = "What's it called?";
    if (!d.oneLiner.trim()) e.oneLiner = "One sentence is enough — but we need it.";
    else {
      const g = gibberishReason(d.oneLiner);
      if (g) e.oneLiner = g;
    }
  }
  if (step === 1) {
    if (!d.targetCustomer.trim()) e.targetCustomer = "Who is this for? Be specific.";
    else if (d.targetCustomer.trim().length < 10)
      e.targetCustomer = "A bit more detail — at least 10 characters so your CMO knows who to target.";
    else {
      const g = gibberishReason(d.targetCustomer);
      if (g) e.targetCustomer = g;
    }
    if (!d.usp.trim()) e.usp = "What makes you different?";
    else {
      const g = gibberishReason(d.usp);
      if (g) e.usp = g;
    }
    if (!d.problem.trim()) e.problem = "Name the pain you remove.";
    else {
      const g = gibberishReason(d.problem);
      if (g) e.problem = g;
    }
  }
  if (step === 2) {
    // Competitors are no longer asked — your CMO discovers them via web search.
    if (!String(d.monthlySpend).trim())
      e.monthlySpend = "Rough monthly marketing spend in ₹ — 0 is a fine answer.";
  }
  if (step === 3) {
    if (d.voice.length === 0) e.voice = "Pick at least one — this shapes how your CMO writes.";
    if (!d.goal) e.goal = "What should we optimise for first?";
    if (d.channels.length === 0) e.channels = "Pick the channels you want to show up on.";
    else if (!d.channels.some((c) => PUBLISHABLE.includes(c)))
      e.channels = "Pick at least one your CMO can publish to: LinkedIn, X or Instagram.";
  }
  return e;
}

export default function OnboardingForm({ onComplete }: { onComplete?: (seed: BrainSeed) => void }) {
  const [data, setData] = useState<BrainSeed>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const reduce = useReducedMotion();

  const set = <K extends keyof BrainSeed>(k: K, v: BrainSeed[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const next = () => {
    const e = validate(step, data);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (!data.consent) {
      setErrors((e) => ({ ...e, consent: "We need your consent to build your CMO." }));
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSeeded(true);
        return;
      }
      if (body?.error === "intake_incomplete") {
        const items = [...(body.missing_fields ?? []), ...(body.problems ?? [])].map(prettyField);
        setServerError(
          items.length
            ? `Please fix — ${items.join("; ")}`
            : body.message || "Some answers need another look — please review and resubmit.",
        );
      } else {
        setServerError(body?.error || "Couldn't save your answers. Please try again.");
      }
    } catch {
      setServerError("Couldn't reach the server. Make sure the backend is running.");
    } finally {
      setSubmitting(false);
    }
  };

  const filledCount = useMemo(() => {
    const checks = [
      data.domain,
      data.productName,
      data.oneLiner,
      data.targetCustomer,
      data.usp,
      data.problem,
      data.stage,
      data.voice.length,
      data.goal,
      data.channels.length,
    ];
    return checks.filter(Boolean).length;
  }, [data]);

  const anim = reduce
    ? {}
    : { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 } };

  if (seeded) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center"
        >
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-molten/30 bg-molten/10 text-molten">
            <Check size={26} aria-hidden />
          </span>
          <h1 className="font-display text-2xl">Your CMO is seeded</h1>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-mute">
            {data.productName ? `${data.productName}'s ` : "Your "}CMO now knows who you are, who you
            serve, and how you want to sound. Time for your first run.
          </p>
          <button
            type="button"
            onClick={() => onComplete?.(data)}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-5 py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
          >
            Go to your workspace <ArrowRight size={15} aria-hidden />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* main form column */}
      <div className="dash-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
          <header className="mb-7">
            <p className="font-data text-[11px] uppercase tracking-[0.18em] text-mute-2">Onboarding · Company memory</p>
            <h1 className="font-display mt-1.5 text-[28px] leading-tight sm:text-[32px]">
              Let&apos;s teach your CMO who you are.
            </h1>
            <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-mute">
              Eight questions. Your answers become the brain every agent reasons from — so the work that follows
              actually sounds like you, not generic AI.
            </p>
          </header>

          {/* Why you're here: the dashboard/CMO are gated on completing this. */}
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-molten/30 bg-molten/[0.07] px-4 py-3">
            <Lock size={15} className="mt-0.5 shrink-0 text-molten" aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-ink/90">
              <span className="font-bold">Your dashboard is locked.</span> Fill in your company details below —
              once your workspace is set up, the Dashboard, your CMO and runs all unlock.
            </p>
          </div>

          {/* progress */}
          <ol className="mb-7 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={s.id} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => i <= step && setStep(i)}
                    disabled={i > step}
                    className="flex items-center gap-2"
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold transition-colors duration-200 ${
                        done
                          ? "border-molten/40 bg-molten/15 text-molten"
                          : active
                            ? "border-molten bg-molten text-white"
                            : "border-line text-mute-2"
                      }`}
                    >
                      {done ? <Check size={14} aria-hidden /> : i + 1}
                    </span>
                    <span
                      className={`font-data hidden text-[10px] uppercase tracking-[0.1em] md:inline ${
                        active ? "text-ink" : "text-mute-2"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-molten/40" : "bg-line"}`} aria-hidden />}
                </li>
              );
            })}
          </ol>

          {/* steps */}
          <AnimatePresence mode="wait">
            <motion.div key={step} {...anim} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="space-y-5">
              {step === 0 && (
                <>
                  <Field label="Your website / domain" htmlFor="domain" required error={errors.domain} helper="e.g. arcinvoicing.in — your CMO reads it to learn your market and brand.">
                    <TextInput id="domain" type="text" inputMode="url" value={data.domain} onChange={(v) => set("domain", v)} placeholder="arcinvoicing.in" invalid={!!errors.domain} />
                  </Field>
                  <Field label="Product / service name" htmlFor="productName" required error={errors.productName}>
                    <TextInput id="productName" value={data.productName} onChange={(v) => set("productName", v)} placeholder="Arc Invoicing" invalid={!!errors.productName} />
                  </Field>
                  <Field label="One-line description" htmlFor="oneLiner" required error={errors.oneLiner} helper="Explain what you do in a single, plain sentence.">
                    <TextArea id="oneLiner" value={data.oneLiner} onChange={(v) => set("oneLiner", v)} placeholder="GST-ready invoicing that pays for itself — built for Indian founders who do their own books." invalid={!!errors.oneLiner} rows={2} max={140} />
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <Field label="Your target customer" htmlFor="targetCustomer" required error={errors.targetCustomer} helper="Who actually buys this? Industry, role, company size, where they are.">
                    <TextArea id="targetCustomer" value={data.targetCustomer} onChange={(v) => set("targetCustomer", v)} placeholder="Solo & small-team founders running Indian SaaS / services, doing their own invoicing — 1 to 10 people, tier-1 & tier-2 cities." invalid={!!errors.targetCustomer} />
                  </Field>
                  <Field label="Your USP" htmlFor="usp" required error={errors.usp} helper="What makes you genuinely different from everything else out there?">
                    <TextArea id="usp" value={data.usp} onChange={(v) => set("usp", v)} placeholder="E-invoice IRN auto-generated — no portal, no accountant back-and-forth. Multi-GSTIN native." invalid={!!errors.usp} />
                  </Field>
                  <Field label="What problem are you solving?" htmlFor="problem" required error={errors.problem} helper="The specific pain your product removes.">
                    <TextArea id="problem" value={data.problem} onChange={(v) => set("problem", v)} placeholder="Founders lose hours and cash to messy, non-compliant invoicing — and only notice when GST filing breaks." invalid={!!errors.problem} />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="rounded-xl border border-molten/20 bg-molten/[0.05] p-3.5">
                    <p className="text-[12.5px] leading-relaxed text-ink/90">
                      <span className="font-semibold text-molten">Competitors?</span> You don&apos;t need to
                      list them — your CMO finds and analyses your real competitors for you with live web
                      research at run time.
                    </p>
                  </div>
                  <Field label="Monthly marketing spend (₹)" htmlFor="monthlySpend" required error={errors.monthlySpend} helper="Roughly, per month. 0 is fine if you're starting organic.">
                    <TextInput id="monthlySpend" inputMode="numeric" value={data.monthlySpend} onChange={(v) => set("monthlySpend", v)} placeholder="25000" invalid={!!errors.monthlySpend} />
                  </Field>
                  <Field label="Current revenue / stage" htmlFor="stage" helper="Rough is fine — it sets how aggressive your CMO gets.">
                    <Select id="stage" value={data.stage} onChange={(v) => set("stage", v as BrainSeed["stage"])} options={STAGES} placeholder="Where are you?" />
                  </Field>
                  {(data.stage === "early" || data.stage === "scaling") && (
                    <Field label="Approx. MRR" htmlFor="mrr" helper="Optional — only if you're comfortable. Stays private.">
                      <TextInput id="mrr" inputMode="numeric" value={data.mrr} onChange={(v) => set("mrr", v)} placeholder="₹ 2,40,000 / mo" />
                    </Field>
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <Field label="Brand voice" required error={errors.voice} helper="Pick up to 3. This is how your CMO will sound in every post.">
                    <ChipSelect options={VOICES} selected={data.voice} onChange={(v) => set("voice", v)} max={3} />
                  </Field>
                  <Field label="Primary goal right now" required error={errors.goal} helper="We'll bias the strategy toward this first.">
                    <Segmented ariaLabel="Primary goal" value={data.goal} onChange={(v) => set("goal", v as BrainSeed["goal"])} options={GOALS} />
                  </Field>
                  <Field label="Channels to show up on" required error={errors.channels} helper="Where your customers actually are.">
                    <ChipSelect options={CHANNELS} selected={data.channels} onChange={(v) => set("channels", v)} />
                  </Field>
                  <Field label="Languages" helper="India-first — your CMO can write in more than English.">
                    <ChipSelect options={LANGUAGES} selected={data.languages} onChange={(v) => set("languages", v)} />
                  </Field>
                </>
              )}

              {step === 4 && (
                <>
                  <Review data={data} onEdit={setStep} />
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${
                      errors.consent ? "border-ember/50 bg-ember/[0.05]" : "border-line bg-surface"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={data.consent}
                      onChange={(e) => set("consent", e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-molten"
                    />
                    <span className="text-[12.5px] leading-relaxed text-mute">
                      I agree to MRK18 processing these details to build and operate my AI CMO. I can
                      export or delete my data at any time.
                    </span>
                  </label>
                  {errors.consent && <p className="text-[12px] text-ember">{errors.consent}</p>}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {serverError && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-ember/30 bg-ember/[0.06] px-3.5 py-2.5 text-[13px] text-ember"
            >
              {serverError}
            </p>
          )}

          {/* nav */}
          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-mute transition-colors duration-150 hover:text-ink disabled:invisible"
            >
              <ArrowLeft size={15} aria-hidden /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-molten via-amber to-ember px-5 py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
              >
                Continue <ArrowRight size={15} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-molten via-amber to-ember px-5 py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-70"
              >
                {submitting ? "Teaching your CMO…" : "Seed my CMO's brain"}
                {!submitting && <Brain size={15} aria-hidden />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* right: brain forming — docked into the shell's collapsible/resizable right panel */}
      <RightPanelSlot>
        <BrainSeedPanel data={data} filled={filledCount} total={10} />
      </RightPanelSlot>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | string[] }) {
  const has = Array.isArray(value) ? value.length > 0 : !!value;
  const text = Array.isArray(value) ? value.join(", ") : value;
  return (
    <div>
      <p className="font-data text-[10px] uppercase tracking-[0.12em] text-mute-2">{label}</p>
      <p className={`mt-0.5 text-[13px] leading-snug ${has ? "text-ink" : "text-mute-2 italic"}`}>{has ? text : "—"}</p>
    </div>
  );
}

function BrainSeedPanel({ data, filled, total }: { data: BrainSeed; filled: number; total: number }) {
  const pct = Math.round((filled / total) * 100);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
          <Brain size={16} className="text-molten" aria-hidden /> Your CMO&apos;s brain
        </h2>
        <p className="mt-1 text-[12px] text-mute">Forming as you answer.</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--overlay-subtle)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-molten to-ember transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="font-data mt-1.5 text-[10px] text-mute-2">{pct}% seeded</p>
      </div>
      <div className="dash-scroll flex-1 space-y-3.5 overflow-y-auto p-5">
        <Row label="Company" value={data.productName} />
        <Row label="Does" value={data.oneLiner} />
        <Row label="For" value={data.targetCustomer} />
        <Row label="Edge" value={data.usp} />
        <Row label="Voice" value={data.voice} />
        <Row label="Goal" value={data.goal ? data.goal[0].toUpperCase() + data.goal.slice(1) : ""} />
        <Row label="Channels" value={data.channels} />
        <Row label="Languages" value={data.languages} />
      </div>
    </div>
  );
}

function Review({ data, onEdit }: { data: BrainSeed; onEdit: (step: number) => void }) {
  const sections: { step: number; title: string; rows: [string, string | string[]][] }[] = [
    {
      step: 0,
      title: "Company",
      rows: [
        ["Website", data.domain],
        ["Product", data.productName],
        ["Does", data.oneLiner],
      ],
    },
    {
      step: 1,
      title: "Customer & edge",
      rows: [
        ["Target customer", data.targetCustomer],
        ["USP", data.usp],
        ["Problem", data.problem],
      ],
    },
    {
      step: 2,
      title: "Market",
      rows: [
        ["Competitors", "Found automatically via web research"],
        ["Stage", STAGES.find((s) => s.value === data.stage)?.label ?? ""],
        ["MRR", data.mrr],
      ],
    },
    {
      step: 3,
      title: "Brand & goals",
      rows: [
        ["Voice", data.voice],
        ["Goal", GOALS.find((g) => g.value === data.goal)?.label ?? ""],
        ["Channels", data.channels],
        ["Languages", data.languages],
      ],
    },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-molten/20 bg-molten/[0.05] p-3.5">
        <p className="text-[13px] leading-relaxed text-ink/90">
          One look before we teach your CMO. Anything off? Jump back and fix it — nothing&apos;s saved until you hit
          the button.
        </p>
      </div>
      {sections.map((sec) => (
        <section key={sec.step} className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-[13px] font-bold tracking-tight">{sec.title}</h3>
            <button type="button" onClick={() => onEdit(sec.step)} className="text-[12px] font-semibold text-amber hover:text-molten">
              Edit
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sec.rows.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
