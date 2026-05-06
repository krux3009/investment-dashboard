// Returns true for `ms` after `value` changes, false otherwise.
// Used to drive the .tick-pulse-cell class on numeric cells when a live
// SSE update lands. Skips the very first render so the pulse only fires
// on actual deltas — initial mount with the SSR value is silent.

"use client";

import { useEffect, useRef, useState } from "react";

export function useTickPulse(value: unknown, ms: number = 600): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prev = useRef(value);
  const initial = useRef(true);

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      prev.current = value;
      return;
    }
    if (prev.current === value) return;
    prev.current = value;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);

  return pulsing;
}
