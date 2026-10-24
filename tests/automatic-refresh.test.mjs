import test from "node:test";
import assert from "node:assert/strict";
import { startAutomaticRefresh } from "../lib/browser/automatic-refresh.ts";

function setup(refresh) {
  const browser = new EventTarget(), page = new EventTarget();
  page.visibilityState = "visible";
  const network = { onLine: true };
  let tick, cleared = false;
  browser.setInterval = (fn, delay) => { assert.equal(delay, 15_000); tick = fn; return 42; };
  browser.clearInterval = id => { assert.equal(id, 42); cleared = true; };
  const stop = startAutomaticRefresh(refresh, browser, page, network);
  return { browser, page, network, tick: () => tick(), stop, cleared: () => cleared };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("refreshes on polling, focus, tab return and reconnect, then removes all listeners", async () => {
  let calls = 0;
  const env = setup(() => { calls++; });
  for (const action of [env.tick, () => env.browser.dispatchEvent(new Event("focus")), () => env.page.dispatchEvent(new Event("visibilitychange")), () => env.browser.dispatchEvent(new Event("online"))]) {
    action(); await settle();
  }
  assert.equal(calls, 4);
  env.stop();
  env.tick(); env.browser.dispatchEvent(new Event("focus")); env.browser.dispatchEvent(new Event("online")); env.page.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(calls, 4); assert.equal(env.cleared(), true);
});

test("never polls in background or offline, and resumes after connection returns", async () => {
  let calls = 0;
  const env = setup(() => { calls++; });
  env.page.visibilityState = "hidden"; env.tick(); await settle();
  env.page.visibilityState = "visible"; env.network.onLine = false; env.tick(); await settle();
  assert.equal(calls, 0);
  env.network.onLine = true; env.browser.dispatchEvent(new Event("online")); await settle();
  assert.equal(calls, 1); env.stop();
});

test("coalesces concurrent triggers and recovers after a rejected refresh", async () => {
  let calls = 0, finish;
  const env = setup(() => { calls++; return calls === 1 ? new Promise((_, reject) => { finish = reject; }) : Promise.resolve(); });
  env.tick(); env.tick(); env.browser.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1);
  finish(Error("network unavailable")); await settle(); env.tick(); await settle();
  assert.equal(calls, 2); env.stop();
});
