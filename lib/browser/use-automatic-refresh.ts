"use client";

import { useEffect, useSyncExternalStore } from "react";
import { startAutomaticRefresh } from "./automatic-refresh";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const snapshot = () => navigator.onLine;
const serverSnapshot = () => true;

export function useAutomaticRefresh(refresh: () => void | Promise<void>, enabled = true) {
  const online = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!enabled) return;
    return startAutomaticRefresh(refresh, window, document, navigator);
  }, [enabled, refresh]);
  return online;
}

export const OFFLINE_MESSAGE = "Немає зв’язку. Дані оновляться після підключення";
