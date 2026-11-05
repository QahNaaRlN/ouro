import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireTourScrollLock } from '../components/onboarding-scroll-lock';

function target(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      contains: (name: string) => classes.has(name),
      add: (...names: string[]) => {
        names.forEach((name) => classes.add(name));
      },
      remove: (...names: string[]) => {
        names.forEach((name) => classes.delete(name));
      },
    },
  };
}

test('tour scroll lock survives overlapping owners and repeated cleanup', () => {
  const body = target(['host-class']),
    first = acquireTourScrollLock(body),
    second = acquireTourScrollLock(body);
  first();
  first();
  assert.equal(body.classes.has('overflow-hidden!'), true);
  second();
  assert.deepEqual([...body.classes], ['host-class']);
  second();
  assert.deepEqual([...body.classes], ['host-class']);
});

test('tour scroll lock preserves a preexisting lock and unrelated classes', () => {
  const body = target(['overflow-hidden!', 'host-class']),
    release = acquireTourScrollLock(body);
  body.classes.add('later-host-class');
  release();
  assert.deepEqual([...body.classes], ['overflow-hidden!', 'host-class', 'later-host-class']);
});

test('tour scroll locks are independent between documents and can be reacquired', () => {
  const first = target(),
    second = target(),
    releaseFirst = acquireTourScrollLock(first),
    releaseSecond = acquireTourScrollLock(second);
  releaseFirst();
  assert.equal(first.classes.size, 0);
  assert.equal(second.classes.has('overflow-hidden!'), true);
  const next = acquireTourScrollLock(first);
  releaseSecond();
  assert.equal(first.classes.has('overflow-hidden!'), true);
  next();
  assert.equal(first.classes.size, 0);
  assert.equal(second.classes.size, 0);
});
