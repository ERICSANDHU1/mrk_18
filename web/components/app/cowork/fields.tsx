"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/** Shared label / helper / error frame for every field. */
export function Field({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] font-semibold text-ink">
        {label}
        {required ? (
          <span className="text-molten" aria-hidden>
            *
          </span>
        ) : (
          <span className="font-data text-[10px] uppercase tracking-[0.12em] text-mute-2">optional</span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-ember" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-[12px] leading-snug text-mute">{helper}</p>
      ) : null}
    </div>
  );
}

const baseInput =
  "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-mute-2 transition-colors duration-150 focus:outline-none";

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  invalid,
  inputMode,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  invalid?: boolean;
  inputMode?: "text" | "url" | "numeric";
}) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={`${baseInput} ${invalid ? "border-ember/60 focus:border-ember" : "border-line focus:border-molten/50"}`}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  rows = 3,
  max,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  rows?: number;
  max?: number;
}) {
  return (
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(max ? e.target.value.slice(0, max) : e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={`${baseInput} resize-none leading-relaxed ${invalid ? "border-ember/60 focus:border-ember" : "border-line focus:border-molten/50"}`}
      />
      {max && (
        <p className="font-data mt-1 text-right text-[10px] text-mute-2">
          {value.length}/{max}
        </p>
      )}
    </div>
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  invalid,
  placeholder = "Select…",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={`${baseInput} appearance-none pr-9 ${value ? "text-ink" : "text-mute-2"} ${
          invalid ? "border-ember/60 focus:border-ember" : "border-line focus:border-molten/50"
        }`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-ink">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" aria-hidden />
    </div>
  );
}

/** Segmented single-choice control (radiogroup). */
export function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors duration-150 ${
              on ? "border-molten/50 bg-molten/10 text-molten" : "border-line bg-surface text-mute hover:border-line-soft hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select chips with an optional max. */
export function ChipSelect({
  options,
  selected,
  onChange,
  max,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else if (!max || selected.length < max) onChange([...selected, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt);
        const locked = !on && max ? selected.length >= max : false;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            disabled={locked}
            onClick={() => toggle(opt)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              on
                ? "border-molten/50 bg-molten/10 text-molten"
                : locked
                  ? "cursor-not-allowed border-line bg-surface text-mute-2 opacity-50"
                  : "border-line bg-surface text-mute hover:border-line-soft hover:text-ink"
            }`}
          >
            {on && <Check size={13} aria-hidden />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text tag input (Enter or comma to add). */
export function TagInput({
  id,
  tags,
  onChange,
  placeholder,
  max = 3,
}: {
  id: string;
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "").trim();
    if (v && !tags.includes(v) && tags.length < max) onChange([...tags, v]);
    setDraft("");
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 focus-within:border-molten/50 ${
        tags.length >= max ? "opacity-100" : ""
      }`}
    >
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-semibold">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="text-mute-2 hover:text-ember">
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      {tags.length < max && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={tags.length === 0 ? placeholder : "Add another…"}
          className="min-w-[120px] flex-1 bg-transparent px-1.5 py-1 text-[14px] text-ink placeholder:text-mute-2 focus:outline-none"
        />
      )}
    </div>
  );
}
