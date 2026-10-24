// Read-only polling works without changing the database's Realtime publication.
export function startAutomaticRefresh(
  refresh: () => void | Promise<void>,
  browser: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">,
  page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  network: Pick<Navigator, "onLine">,
) {
  let disposed = false;
  let running = false;
  const update = async () => {
    if (disposed || running || !network.onLine || page.visibilityState !== "visible") return;
    running = true;
    try { await refresh(); } catch { /* The consumer retains data and displays its error state. */ }
    finally { running = false; }
  };
  const timer = browser.setInterval(() => { void update(); }, 15_000);
  browser.addEventListener("focus", update);
  browser.addEventListener("online", update);
  page.addEventListener("visibilitychange", update);
  return () => {
    disposed = true;
    browser.clearInterval(timer);
    browser.removeEventListener("focus", update);
    browser.removeEventListener("online", update);
    page.removeEventListener("visibilitychange", update);
  };
}
