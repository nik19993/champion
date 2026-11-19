"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ATTENDANCE_QUEUE_CHANGED_EVENT, flushAttendanceQueue, queuedAttendance } from "@/lib/offline/attendance-queue";

export function ConnectionStatus({ client, profileId }: { client: SupabaseClient; profileId: string }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void queuedAttendance(profileId).then((items) => setQueued(items.length)).catch(() => setQueued(0));
    };
    const sync = async () => {
      refresh();
      if (!navigator.onLine) return;
      setSyncing(true);
      try {
        const result = await flushAttendanceQueue(client, profileId);
        setQueued(result.remaining);
      } catch {
        // The local queue can be unavailable in a restricted browser session.
      } finally {
        setSyncing(false);
      }
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", refresh);
    window.addEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, refresh);
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", refresh);
      window.removeEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, [client, profileId]);

  if (online && queued === 0) return null;

  const className = `connection-status ${online ? "syncing" : "offline"}`;
  const icon = online ? <RefreshCw className={syncing ? "spin" : ""} size={17} /> : <CloudOff size={17} />;
  const text = !online
    ? `Немає інтернету${queued ? ` · ${queued} записів у черзі` : ""}`
    : syncing
      ? `Синхронізуємо дані · залишилось: ${queued}`
      : `${queued} записів очікують синхронізації`;
  return <div className={className} role="status" aria-live="polite">{icon}<span>{text}</span></div>;
}
