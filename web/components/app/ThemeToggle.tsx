"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const KEY = "mrk18-theme";

const systemDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Toggle the dashboard's night palette (`.mrk18-dark` on <html>). Light = warm
 *  sand, Dark = night; the dark tokens are scoped to .app-scope in globals.css. */
function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && systemDark());
  document.documentElement.classList.toggle("mrk18-dark", dark);
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Appearance switcher — System / Light / Dark. Self-contained: persists the
 *  choice and re-applies it; the no-flash script in the root layout applies the
 *  saved choice on first paint. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? "system";
    setTheme(saved);
    // keep "system" in lock-step with the OS while it's the active choice
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (((localStorage.getItem(KEY) as Theme | null) ?? "system") === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode — the choice just won't persist */
    }
    apply(t);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`grid h-7 w-8 place-items-center rounded-lg transition-colors ${
              active
                ? "bg-molten/15 text-molten"
                : "text-mute-2 hover:bg-[var(--overlay-subtle)] hover:text-ink"
            }`}
          >
            <Icon size={15} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
