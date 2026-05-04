"use client";

import { useEffect, useRef, useState } from "react";
import { deleteNote, fetchNote, putNote } from "@/lib/api";

interface Props {
  code: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; detail: string };

const DEBOUNCE_MS = 800;

function formatRelative(then: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return then.toLocaleString();
}

export function NotesBlock({ code }: Props) {
  const [body, setBody] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [, force] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchNote(code);
      if (cancelled) return;
      if (result.ok) {
        const initial = result.data?.body ?? "";
        setBody(initial);
        lastSavedRef.current = initial;
        if (result.data) {
          setSave({ kind: "saved", at: new Date(result.data.updated_at) });
        }
      } else {
        setSave({ kind: "error", detail: result.detail });
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (save.kind !== "saved") return;
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [save]);

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (next === lastSavedRef.current) return;
      setSave({ kind: "saving" });
      if (next.trim() === "") {
        await deleteNote(code);
        lastSavedRef.current = "";
        setSave({ kind: "idle" });
        return;
      }
      const result = await putNote(code, next);
      if (result.ok) {
        lastSavedRef.current = next;
        setSave({ kind: "saved", at: new Date(result.data?.updated_at ?? Date.now()) });
      } else {
        setSave({ kind: "error", detail: result.detail });
      }
    }, DEBOUNCE_MS);
  }

  function onChange(next: string) {
    setBody(next);
    scheduleSave(next);
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        Notes
      </div>
      <textarea
        aria-label={`Notes for ${code}`}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={loaded ? "Thesis, triggers, risks…" : ""}
        className="w-full bg-surface-raised border border-rule rounded-sm px-3 py-2 text-sm leading-[1.55] text-ink placeholder:text-whisper placeholder:italic focus:outline-none focus:border-accent resize-y font-sans"
      />
      <div className="text-xs text-whisper mt-1.5 h-4">
        {save.kind === "saving" && "saving…"}
        {save.kind === "saved" && `Last saved · ${formatRelative(save.at)}`}
        {save.kind === "error" && (
          <span className="text-loss">save failed · {save.detail}</span>
        )}
      </div>
    </div>
  );
}
