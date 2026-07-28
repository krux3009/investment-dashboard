// Number / currency formatters mirroring src/dashboard/data/positions.py.
// Unicode minus (U+2212) for negatives — never the hyphen-minus.

const SYMBOLS: Record<string, string> = {
  USD: "$",
  HKD: "HK$",
  CNH: "¥",
  JPY: "¥",
  SGD: "S$",
  AUD: "A$",
  MYR: "RM",
  CAD: "C$",
  "?": "",
};

const MINUS = "−";

export function fmtUsd(value: number, opts: { decimals?: number; signed?: boolean } = {}) {
  const { decimals = 0, signed = false } = opts;
  if (value === 0) return signed ? `$0` : "$0";
  const sign = value > 0 ? (signed ? "+" : "") : MINUS;
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtCurrency(value: number, currency: string, opts: { decimals?: number; signed?: boolean } = {}) {
  const { decimals = 2, signed = false } = opts;
  const sym = SYMBOLS[currency] ?? "";
  if (value === 0) return signed ? `${sym}0` : `${sym}0`;
  const sign = value > 0 ? (signed ? "+" : "") : MINUS;
  const abs = Math.abs(value);
  return `${sign}${sym}${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtPct(value: number | null, decimals = 2) {
  if (value === null) return "–"; // en dash, never em dash
  if (value === 0) return "0.0%";
  const sign = value > 0 ? "+" : MINUS;
  return `${sign}${(Math.abs(value) * 100).toFixed(decimals)}%`;
}

// Value already in percent units (3.4 → "3.4%"), unsigned. For yields and
// ratios where a +/− would read as a change rather than a level.
export function fmtPctPlain(value: number | null, decimals = 2) {
  if (value == null) return "–";
  return `${value.toFixed(decimals)}%`;
}

export function arrowFor(value: number | null): "↑" | "↓" | "–" {
  if (value === null || value === 0) return "–";
  return value > 0 ? "↑" : "↓";
}

// Direction-of-change → semantic color class. Pair with arrow + sign,
// never the sole signal per "The No-Green-On-Red Rule".
export function directionClass(value: number | null): string {
  if (value === null || value === 0) return "text-quiet";
  return value > 0 ? "text-gain" : "text-loss";
}
