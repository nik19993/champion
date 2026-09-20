"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { flushAttendanceQueue, queuedAttendance } from "@/lib/offline/attendance-queue";

export function ConnectionStatus({ client, profileId }: { client: SupabaseClient; profileId: string }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => { setOnline(navigator.onLine); void queuedAttendance(profileId).then((items) => setQueued(items.length)).catch(() => setQueued(0)); };
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
    const timer = window.setInterval(refresh, 20_000);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", refresh); window.clearInterval(timer); };
  }, [client, profileId]);

  if (online && queued === 0) return null;
  return <div className={`connection-status${online ? " syncing" : " offline"}`} role="status">{online ? <RefreshCw className={syncing ? "spin" : ""} size={17} /> : <CloudOff size={17} />}<span>{online ? `${queued} записів очікують синхронізації` : "Офлайн: присутність буде збережена в черзі"}</span></div>;
}
