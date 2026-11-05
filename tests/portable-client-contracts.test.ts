import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freezeProjectCommandIntent,
  InvalidProjectCommandIntentError,
} from '../packages/client/src/ports';
import type { FrozenProjectCommandIntent } from '../packages/client/src/ports';

const intent = (): FrozenProjectCommandIntent => ({
  operation: 'execute-command',
  scope: { projectId: 'project-a', actorId: 'human-a', accessEpoch: 3 },
  requestId: 'request-original',
  expectedVersion: 2,
  body: '{ "type":"createSpec", "requestId":"request-original", "expectedVersion":2, "content":{"goal":"исходный текст"} }',
});

test('portable command intent preserves exact serialized bytes and freezes the original context', () => {
  const input = intent();
  const frozen = freezeProjectCommandIntent(input);
  assert.equal(frozen.body, input.body);
  assert.equal(frozen.requestId, input.requestId);
  assert.deepEqual(frozen.scope, input.scope);
  assert(Object.isFrozen(frozen));
  assert(Object.isFrozen(frozen.scope));
  assert.notStrictEqual(frozen.scope, input.scope);
});

test('portable command intent rejects identity or version mismatches before a transport can send', () => {
  const original = intent();
  for (const changed of [
    { ...original, requestId: 'replacement-request' },
    { ...original, expectedVersion: 3 },
    { ...original, scope: { ...original.scope, projectId: '' } },
    { ...original, scope: { ...original.scope, actorId: '' } },
    { ...original, scope: { ...original.scope, accessEpoch: -1 } },
    { ...original, body: 'not-json' },
    { ...original, body: 'null' },
  ])
    assert.throws(() => freezeProjectCommandIntent(changed), InvalidProjectCommandIntentError);
});

test('task assignment intent preserves its existing endpoint body without inventing a command type', () => {
  const input: FrozenProjectCommandIntent = {
    ...intent(),
    operation: 'start-project-work',
    body: '{"requestId":"request-original","expectedVersion":2,"agentId":"agent-a","content":{"title":"Работа"}}',
  };
  assert.equal(freezeProjectCommandIntent(input).body, input.body);
  assert.throws(
    () =>
      freezeProjectCommandIntent({
        ...input,
        body: input.body.replace('"agentId":"agent-a",', '"type":"startProjectWork",'),
      }),
    InvalidProjectCommandIntentError,
  );
});
