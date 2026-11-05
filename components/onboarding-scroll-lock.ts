type ScrollLockTarget = { classList: Pick<DOMTokenList, 'add' | 'remove' | 'contains'> };
type Lease = { count: number; wasPresent: boolean };
const utility = 'overflow-hidden!';
const active = new WeakMap<ScrollLockTarget, Lease>();

/** Удерживает блокировку до закрытия последнего тура, сохраняя прежние классы и inline style. */
export function acquireTourScrollLock(target: ScrollLockTarget): () => void {
  let lease = active.get(target);
  if (!lease) {
    lease = { count: 0, wasPresent: target.classList.contains(utility) };
    active.set(target, lease);
  }
  lease.count++;
  target.classList.add(utility);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lease.count--;
    if (lease.count) return;
    active.delete(target);
    if (!lease.wasPresent) target.classList.remove(utility);
  };
}
