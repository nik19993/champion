"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/common/workspace-ui";

const WORKDAY_IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;
const SHARED_DEVICE_IDLE_LIMIT_MS = 30 * 60 * 1000;
const SHARED_DEVICE_STORAGE_KEY = "champion:shared-device";

export function SessionTimeoutGuard({
  client,
  profileId,
}: {
  client: SupabaseClient;
  profileId: string;
}) {
  const [warning, setWarning] = useState(false);
  const [warningMinutes, setWarningMinutes] = useState(5);
  const continueSession = useRef<() => void>(() => undefined);

  useEffect(() => {
    const storageKey = `champion:last-activity:${profileId}`;
    let warningTimer: number | null = null;
    let logoutTimer: number | null = null;
    let disposed = false;

    function clearTimers() {
      if (warningTimer !== null) window.clearTimeout(warningTimer);
      if (logoutTimer !== null) window.clearTimeout(logoutTimer);
      warningTimer = null;
      logoutTimer = null;
    }

    async function expireSession() {
      if (disposed) return;
      clearTimers();
      window.localStorage.removeItem(storageKey);
      setWarning(false);
      await client.auth.signOut({ scope: "local" });
    }

    function lastActivity() {
      const parsed = Number(window.localStorage.getItem(storageKey));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function sessionTiming() {
      const sharedDevice = window.localStorage.getItem(SHARED_DEVICE_STORAGE_KEY) === "true";
      return sharedDevice
        ? { idleLimit: SHARED_DEVICE_IDLE_LIMIT_MS, warningBefore: 60 * 1000 }
        : { idleLimit: WORKDAY_IDLE_LIMIT_MS, warningBefore: 5 * 60 * 1000 };
    }

    function schedule() {
      clearTimers();
      const { idleLimit, warningBefore } = sessionTiming();
      const remaining = idleLimit - (Date.now() - lastActivity());
      if (remaining <= 0) {
        void expireSession();
        return;
      }
      setWarningMinutes(Math.max(1, Math.round(warningBefore / 60_000)));
      warningTimer = window.setTimeout(
        () => setWarning(true),
        Math.max(0, remaining - warningBefore),
      );
      logoutTimer = window.setTimeout(() => void expireSession(), remaining);
    }

    function registerActivity() {
      const previousActivity = lastActivity();
      const { idleLimit } = sessionTiming();
      if (previousActivity && Date.now() - previousActivity >= idleLimit) {
        void expireSession();
        return;
      }
      window.localStorage.setItem(storageKey, String(Date.now()));
      setWarning(false);
      schedule();
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      if (event.newValue) schedule();
      else void expireSession();
    }

    continueSession.current = registerActivity;
    const eventNames: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    for (const eventName of eventNames) {
      window.addEventListener(eventName, registerActivity, { passive: true });
    }
    window.addEventListener("storage", handleStorage);

    void client.auth.getSession().then(({ data }) => {
      if (disposed) return;
      const signedInAt = Date.parse(data.session?.user.last_sign_in_at ?? "") || 0;
      if (!lastActivity() || lastActivity() < signedInAt) {
        window.localStorage.setItem(storageKey, String(Date.now()));
      }
      schedule();
    });

    return () => {
      disposed = true;
      clearTimers();
      for (const eventName of eventNames) window.removeEventListener(eventName, registerActivity);
      window.removeEventListener("storage", handleStorage);
    };
  }, [client, profileId]);

  if (!warning) return null;
  return (
    <Modal
      title="Сесію буде завершено"
      onClose={() => continueSession.current()}
      footer={
        <button className="primary-action" type="button" onClick={() => continueSession.current()}>
          Продовжити роботу
        </button>
      }
    >
      <div className="status-message warning" role="alert">
        <Clock3 size={20} />
        <span>Через {warningMinutes === 1 ? "1 хвилину" : `${warningMinutes} хвилин`} бездіяльності буде виконано автоматичний вихід.</span>
      </div>
    </Modal>
  );
}
