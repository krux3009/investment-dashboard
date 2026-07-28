"use client";

// The one client-side lazy-fetch hook. Replaces the hand-rolled
// useEffect + cancelled-flag + loading/error state that every drill-in
// block used to reimplement with its own encoding.
//
// Consumers pick the view they need:
//   • `state` — discriminated union for loading / ready / error UIs
//   • `data`  — last successful payload, kept during reloads (for
//     switcher surfaces that dim old content instead of blanking it)
//   • `loading` / `error` — plain flags

import { useEffect, useState } from "react";

export type FetchState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "error"; detail: string };

export interface UseFetchResult<T> {
  state: FetchState<T>;
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFetch<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
): UseFetchResult<T> {
  const [state, setState] = useState<FetchState<T>>({ kind: "loading" });
  const [last, setLast] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fn().then(
      (data) => {
        if (cancelled) return;
        setState({ kind: "ready", data });
        setLast(data);
      },
      (e: unknown) => {
        if (cancelled) return;
        const detail = e instanceof Error ? e.message : String(e);
        setState({ kind: "error", detail });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    state,
    data: state.kind === "ready" ? state.data : last,
    loading: state.kind === "loading",
    error: state.kind === "error" ? state.detail : null,
  };
}
