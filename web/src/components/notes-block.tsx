"use client";

import { useEffect, useRef, useState } from "react";
import { deleteNote, fetchNote, putNote } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useFormatRelative } from "@/lib/i18n/use-relative-time";

interface Props {
  code: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; detail: string };

const DEBOUNCE_MS = 800;

export function NotesBlock({ code }: Props) {
  const t = useT();
  const formatRelative = useFormatRelative();
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
        {t("notes.heading")}
      </div>
      <textarea
        aria-label={t("notes.aria_for", { code })}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={loaded ? t("notes.placeholder") : ""}
        className="w-full bg-surface-raised border border-rule rounded-sm px-3 py-2 text-sm leading-[1.55] text-ink placeholder:text-whisper placeholder:italic focus:outline-none focus:border-accent resize-y font-sans"
      />
      <div className="text-xs text-whisper mt-1.5 h-4">
        {save.kind === "saving" && t("notes.saving")}
        {save.kind === "saved" &&
          t("notes.last_saved", { relative: formatRelative(save.at) })}
        {save.kind === "error" && (
          <span className="text-loss">
            {t("notes.save_failed", { detail: save.detail })}
          </span>
        )}
      </div>
    </div>
  );
}
