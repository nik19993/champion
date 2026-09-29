export const DRAFTS_CHANGED_EVENT = "champion:drafts-changed";
const DRAFT_STORAGE_PREFIX = "champion:draft:";
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  version: 1;
  profileId: string;
  savedAt: string;
  value: T;
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyDraftsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
}

export function draftKey(profileId: string, scope: string) {
  return `${DRAFT_STORAGE_PREFIX}${profileId}:${scope}`;
}

export function readDraft<T>(key: string) {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft<T>;
    const savedAt = Date.parse(draft.savedAt);
    if (draft.version !== 1 || !Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
      storage.removeItem(key);
      notifyDraftsChanged();
      return null;
    }
    return draft;
  } catch {
    storage.removeItem(key);
    notifyDraftsChanged();
    return null;
  }
}

export function writeDraft<T>(key: string, profileId: string, value: T) {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    const draft: StoredDraft<T> = {
      version: 1,
      profileId,
      savedAt: new Date().toISOString(),
      value,
    };
    storage.setItem(key, JSON.stringify(draft));
    notifyDraftsChanged();
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string) {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
    notifyDraftsChanged();
  } catch {
    // Storage may be unavailable in a private or restricted browser context.
  }
}

export function countDrafts(profileId: string) {
  const storage = browserStorage();
  if (!storage) return 0;
  let count = 0;
  const prefix = `${DRAFT_STORAGE_PREFIX}${profileId}:`;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    if (readDraft(key)) count += 1;
  }
  return count;
}
