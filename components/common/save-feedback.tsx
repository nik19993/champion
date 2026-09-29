"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileClock, LoaderCircle, RotateCcw, Trash2, Undo2 } from "lucide-react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_LABELS: Record<Exclude<SaveState, "idle">, string> = {
  dirty: "Є незбережені зміни",
  saving: "Зберігаємо…",
  saved: "Збережено",
  error: "Не збережено",
};

export function SaveStateLabel({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const Icon = state === "saved" ? CheckCircle2 : state === "saving" ? LoaderCircle : state === "error" ? AlertTriangle : Clock3;
  return <span className={`save-state-label ${state}`} role={state === "error" ? "alert" : "status"}><Icon className={state === "saving" ? "spin" : undefined} size={15} />{SAVE_LABELS[state]}</span>;
}

export function UndoLastChange({ busy = false, onUndo }: { busy?: boolean; onUndo: () => void | Promise<void> }) {
  return <button type="button" className="undo-last-action" disabled={busy} onClick={() => void onUndo()}><Undo2 size={15} />{busy ? "Скасовуємо…" : "Скасувати останню зміну"}</button>;
}

export type DraftState = "idle" | "saving" | "saved" | "restored";

export function DraftStatus({ state, onClear }: { state: DraftState; onClear?: () => void }) {
  if (state === "idle") return null;
  const Icon = state === "saving" ? LoaderCircle : state === "restored" ? RotateCcw : FileClock;
  const label = state === "saving"
    ? "Автоматично зберігаємо чернетку…"
    : state === "restored"
      ? "Відновлено незбережену чернетку з цього пристрою"
      : "Чернетку автоматично збережено на цьому пристрої";
  return <div className={`draft-status ${state}`} role="status"><Icon className={state === "saving" ? "spin" : undefined} size={16} /><span>{label}</span>{onClear && <button type="button" onClick={onClear}><Trash2 size={14} />Очистити</button>}</div>;
}
