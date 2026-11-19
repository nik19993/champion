import assert from "node:assert/strict";
import { test } from "node:test";
import { lockPageScroll } from "../lib/browser/modal-scroll.ts";

function body() {
  const attrs = new Map();
  return {
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
    get locked() { return attrs.has("data-workspace-modal-open"); },
  };
}

test("switching tabs while two dialogs are open releases the page", () => {
  const page = body();
  const closeParent = lockPageScroll(page);
  const closeChild = lockPageScroll(page);
  assert.equal(page.locked, true);

  closeParent();
  assert.equal(page.locked, true, "the child dialog is still open");
  closeChild();
  assert.equal(page.locked, false, "neither dialog remains after the tab switch");
});

test("closing the front dialog leaves the underlying dialog locked", () => {
  const page = body();
  const closeParent = lockPageScroll(page);
  const closeChild = lockPageScroll(page);
  closeChild();
  closeChild();
  assert.equal(page.locked, true, "repeated cleanup cannot unlock a different dialog");
  closeParent();
  assert.equal(page.locked, false);

  const closeNext = lockPageScroll(page);
  assert.equal(page.locked, true);
  closeNext();
  assert.equal(page.locked, false);
});
