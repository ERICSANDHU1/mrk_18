const inrFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numIN = new Intl.NumberFormat("en-IN");

/** ₹1,86,000 — full Indian-grouped rupees */
export function formatINR(n: number): string {
  return inrFull.format(n);
}

/** 48,200 — Indian-grouped number */
export function formatNum(n: number): string {
  return numIN.format(n);
}

/** ₹1.86L / ₹42k / ₹2.1Cr — compact founder-speak rupees */
export function formatCompactINR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1e7) return `${sign}₹${trim((v / 1e7).toFixed(2))}Cr`;
  if (v >= 1e5) return `${sign}₹${trim((v / 1e5).toFixed(2))}L`;
  if (v >= 1e3) return `${sign}₹${trim((v / 1e3).toFixed(1))}k`;
  return `${sign}₹${Math.round(v)}`;
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, "");
}

/** +12% / −8% with sign always shown */
export function formatDelta(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)}%`;
}
