const activeLocks = new WeakMap<HTMLElement, number>();
const lockAttribute = "data-workspace-modal-open";

/** Keep the workspace fixed until the last open dialog is removed. */
export function lockPageScroll(region: HTMLElement): () => void {
  activeLocks.set(region, (activeLocks.get(region) ?? 0) + 1);
  region.setAttribute(lockAttribute, "");

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeLocks.get(region) ?? 1) - 1;
    if (remaining > 0) {
      activeLocks.set(region, remaining);
    } else {
      activeLocks.delete(region);
      region.removeAttribute(lockAttribute);
    }
  };
}
