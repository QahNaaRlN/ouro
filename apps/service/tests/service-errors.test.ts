import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
const rootRequire = createRequire(import.meta.url);
const errors: typeof import('../../../lib/http') = rootRequire('../../../lib/http');

test('unknown HTTP failure reports only bounded metadata and isolates throwing/rejecting reporters', async () => {
  const secret = 'fixture-secret-SQL-and-cookie-value',
    logs: unknown[][] = [],
    previous = console.error;
  const events: unknown[] = [];
  const apiError: (error: unknown, report?: (event: unknown) => void | Promise<void>) => Response =
    errors.apiError;
  console.error = (...items: unknown[]) => {
    logs.push(items);
  };
  try {
    const response = apiError(new Error(secret), (event) => {
      events.push(event);
    });
    assert.equal(response.status, 500);
    assert.equal(events.length, 1);
    const event = events[0] as { code: string; operation: string; occurrenceId: string };
    assert.deepEqual(Object.keys(event).sort(), ['code', 'occurrenceId', 'operation']);
    assert.equal(event.code, 'HTTP_INTERNAL_ERROR');
    assert.equal(event.operation, 'http.request');
    assert.match(event.occurrenceId, /^[a-f0-9-]{36}$/);
    assert.equal(
      apiError(new Error(secret), () => {
        throw new Error(secret);
      }).status,
      500,
    );
    assert.equal(
      apiError(new Error(secret), async () => {
        throw new Error(secret);
      }).status,
      500,
    );
    const fallback = apiError(new Error(secret));
    assert.equal(fallback.status, 500);
    await delay(0);
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(inspect(logs).includes(secret), false);
    assert.equal((await fallback.text()).includes(secret), false);
  } finally {
    console.error = previous;
  }
});
