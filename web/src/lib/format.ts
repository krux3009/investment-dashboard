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

export function timeSince(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return "moments ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}
