"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CloudCheck, CloudOff, FileClock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ATTENDANCE_QUEUE_CHANGED_EVENT, flushAttendanceQueue, queuedAttendance } from "@/lib/offline/attendance-queue";
import { countDrafts, DRAFTS_CHANGED_EVENT } from "@/lib/offline/drafts";

export function ConnectionStatus({ client, profileId }: { client: SupabaseClient; profileId: string }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [drafts, setDrafts] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      setDrafts(countDrafts(profileId));
      void queuedAttendance(profileId).then((items) => setQueued(items.length)).catch(() => setQueued(0));
    };
    const sync = async () => {
      refresh();
      if (!navigator.onLine) return;
      setSyncing(true);
      try {
        const result = await flushAttendanceQueue(client, profileId);
        setQueued(result.remaining);
      } finally {
        setSyncing(false);
      }
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", refresh);
    window.addEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener(DRAFTS_CHANGED_EVENT, refresh);
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", refresh);
      window.removeEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener(DRAFTS_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, [client, profileId]);

  const className = `connection-status${!online ? " offline" : syncing || queued ? " syncing" : drafts ? " drafts" : " synced"}`;
  const icon = !online
    ? <CloudOff size={17} />
    : syncing || queued
      ? <RefreshCw className={syncing ? "spin" : ""} size={17} />
      : drafts
        ? <FileClock size={17} />
        : <CloudCheck size={17} />;
  const text = !online
    ? `Немає інтернету · ${queued ? `${queued} записів у черзі` : "нові чернетки залишаться на цьому пристрої"}${drafts ? ` · чернеток: ${drafts}` : ""}`
    : syncing
      ? `Синхронізуємо дані${queued ? ` · залишилось: ${queued}` : ""}`
      : queued
        ? `${queued} записів очікують синхронізації`
        : drafts
          ? `Онлайн · ${drafts} ${drafts === 1 ? "чернетку" : "чернетки"} збережено на цьому пристрої`
          : "Онлайн · усі збережені дані синхронізовано";
  return <div className={className} role="status" aria-live="polite">{icon}<span>{text}</span></div>;
}
