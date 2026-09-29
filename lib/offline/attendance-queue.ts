import type { SupabaseClient } from "@supabase/supabase-js";

export interface AttendanceQueueItem {
  idempotencyKey: string;
  eventId: string;
  completedBy: string;
  createdAt: string;
  records: Array<{ player_id: string; status: "present" | "absent"; note: string }>;
}

const DATABASE = "champion-offline";
const STORE = "attendance-queue";
export const ATTENDANCE_QUEUE_CHANGED_EVENT = "champion:attendance-queue-changed";

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ATTENDANCE_QUEUE_CHANGED_EVENT));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "idempotencyKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueAttendance(item: AttendanceQueueItem) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyQueueChanged();
}

export async function queuedAttendance(completedBy?: string): Promise<AttendanceQueueItem[]> {
  const db = await openDatabase();
  const items = await new Promise<AttendanceQueueItem[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as AttendanceQueueItem[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return completedBy ? items.filter((item) => item.completedBy === completedBy) : items;
}

async function removeQueuedAttendance(key: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function persistAttendance(client: SupabaseClient, item: AttendanceQueueItem) {
  const result = await client.rpc("save_attendance", {
    p_event_id: item.eventId,
    p_idempotency_key: item.idempotencyKey,
    p_client_created_at: item.createdAt,
    p_records: item.records,
  });
  if (result.error) throw result.error;
}

export async function flushAttendanceQueue(client: SupabaseClient, completedBy: string) {
  const items = await queuedAttendance(completedBy);
  let completed = 0;
  for (const item of items) {
    try {
      await persistAttendance(client, item);
      await removeQueuedAttendance(item.idempotencyKey);
      completed += 1;
    } catch {
      // Keep the item for the next online retry. No sensitive contents are logged.
    }
  }
  notifyQueueChanged();
  return { completed, remaining: items.length - completed };
}
