"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Panel from "../Panel";

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="text-[12px] text-muted">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          on ? "border-amber/40 bg-amber/25" : "border-stroke-2 bg-surface-2"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all duration-200 ${
            on ? "left-[22px] bg-amber" : "left-0.5 bg-muted"
          }`}
        />
      </button>
    </div>
  );
}

const FIELD =
  "w-full rounded-lg border border-stroke-2 bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 focus:border-amber/40 focus:outline-none";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

export default function SettingsView() {
  const [voice, setVoice] = useState<"blunt" | "gentle">("blunt");
  const [notif, setNotif] = useState({ leaks: true, report: true, sync: false });
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Panel eyebrow="Workspace" title="Arc Invoicing" delay={1}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ws-name" className={LABEL}>
              Workspace name
            </label>
            <input id="ws-name" defaultValue="Arc Invoicing" className={FIELD} />
          </div>
          <div>
            <label htmlFor="ws-currency" className={LABEL}>
              Currency
            </label>
            <select id="ws-currency" defaultValue="INR" className={FIELD}>
              <option value="INR">₹ INR — Indian Rupee</option>
              <option value="USD">$ USD — US Dollar</option>
            </select>
          </div>
          <div>
            <label htmlFor="ws-tz" className={LABEL}>
              Timezone
            </label>
            <select id="ws-tz" defaultValue="IST" className={FIELD}>
              <option value="IST">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div>
            <label htmlFor="ws-target" className={LABEL}>
              Monthly customer target
            </label>
            <input id="ws-target" type="number" defaultValue={60} className={`${FIELD} font-mono`} />
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Your CMO" title="How the verdicts talk to you" delay={2}>
        <fieldset>
          <legend className={LABEL}>Voice</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                { id: "blunt", name: "Blunt operator", desc: "\"₹42k is draining. Fix it today.\" No padding." },
                { id: "gentle", name: "Direct but gentle", desc: "Same truths, softer delivery, more context." },
              ] as const
            ).map((v) => (
              <label
                key={v.id}
                className={`cursor-pointer rounded-xl border p-3.5 transition-colors duration-200 ${
                  voice === v.id ? "border-amber/40 bg-amber/[0.05]" : "border-stroke-2 hover:bg-white/[0.02]"
                }`}
              >
                <input
                  type="radio"
                  name="voice"
                  value={v.id}
                  checked={voice === v.id}
                  onChange={() => setVoice(v.id)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between text-[13px] font-bold">
                  {v.name}
                  {voice === v.id && <Check size={14} className="text-amber" aria-hidden />}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">{v.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cmo-day" className={LABEL}>
              Weekly report lands on
            </label>
            <select id="cmo-day" defaultValue="mon" className={FIELD}>
              <option value="mon">Monday morning</option>
              <option value="fri">Friday evening</option>
              <option value="sun">Sunday evening</option>
            </select>
          </div>
          <div>
            <label htmlFor="cmo-conf" className={LABEL}>
              Only alert me when confidence is
            </label>
            <select id="cmo-conf" defaultValue="medium" className={FIELD}>
              <option value="high">High</option>
              <option value="medium">Medium or higher</option>
              <option value="low">Any — tell me everything</option>
            </select>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Notifications" title="When to interrupt you" delay={3}>
        <div className="divide-y divide-[rgba(255,255,255,0.07)]">
          <Toggle
            label="Leak alerts"
            hint="The moment a channel starts draining money."
            on={notif.leaks}
            onChange={(v) => setNotif((n) => ({ ...n, leaks: v }))}
          />
          <Toggle
            label="Weekly report"
            hint="The bitter-truth report, when it lands."
            on={notif.report}
            onChange={(v) => setNotif((n) => ({ ...n, report: v }))}
          />
          <Toggle
            label="Sync failures"
            hint="When a data source stops talking to us."
            on={notif.sync}
            onChange={(v) => setNotif((n) => ({ ...n, sync: v }))}
          />
        </div>
      </Panel>

      <Panel eyebrow="Data" title="Yours, always" delay={4}>
        <div className="flex flex-wrap gap-2.5">
          <button className="rounded-lg border border-stroke-2 px-3.5 py-2 text-[12px] font-semibold transition-colors duration-200 hover:bg-white/5">
            Export everything (CSV)
          </button>
          <button className="rounded-lg border border-bad/25 px-3.5 py-2 text-[12px] font-semibold text-bad transition-colors duration-200 hover:bg-bad/10">
            Delete workspace
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Deleting removes every metric, verdict and report within 24 hours. Connected ad accounts
          are never touched.
        </p>
      </Panel>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-5 py-2.5 text-[13px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
        >
          Save changes
        </button>
        <span
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-good transition-opacity duration-300 ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          <Check size={13} aria-hidden /> Saved
        </span>
      </div>
    </div>
  );
}
