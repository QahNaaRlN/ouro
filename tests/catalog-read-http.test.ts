import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogHttpReads } from '../packages/client/src/http/create-catalog-http-reads';
import { ClientError } from '../packages/client/src/ports';
import { createClientCancellation } from '../packages/client/src/lifecycle/create-client-cancellation';

const scope = {
  ownerId: 'fixture',
  sourceId: 'fixture',
  actorId: 'actor',
  projectId: null,
  accessEpoch: 1,
};

/** Подменяет только транспорт собственного fixture и восстанавливает global fetch. */
async function withResponse<T>(body: unknown, run: () => Promise<T>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(body);
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

test('CRP00 baseline session keeps optional actor and truthy account projection without account payload', async () => {
  assert.deepEqual(
    await withResponse({}, () => createCatalogHttpReads().readIdentitySession(scope)),
    {
      status: 'available',
      value: { actor: null, hasAccount: false, canManageParticipants: false },
    },
  );
  const actor = { id: 'opaque-account', kind: 'human', projectIds: ['one'] };
  assert.deepEqual(
    await withResponse(
      { actor, account: { credential: 'fixture-secret' }, canManageParticipants: false },
      () => createCatalogHttpReads().readIdentitySession(scope),
    ),
    { status: 'available', value: { actor, hasAccount: true, canManageParticipants: false } },
  );
});

test('CRP02 malformed account catalog cannot become accepted project data', async () => {
  await withResponse(
    { projects: [{ id: 'foreign', name: 'Unvalidated', role: 'Root' }] },
    async () => {
      await assert.rejects(async () => {
        return createCatalogHttpReads().listAccountProjects(scope);
      });
    },
  );
});

test('CRP02 explicit session/account/workspace schemas preserve actual wire optional and null contracts', async () => {
  const actor = { id: 'opaque', kind: 'human', projectIds: ['p'] },
    workspace = {
      id: 'p',
      name: 'Folder',
      rootPath: null,
      kind: 'demo',
      createdAt: '2026-11-04T00:00:00.000Z',
      createdBy: null,
    },
    account = {
      id: 'p',
      name: 'Account',
      slug: 'account',
      createdAt: workspace.createdAt,
      createdBy: null,
      role: 'Viewer',
    };
  for (const body of [
    {},
    { actor: null },
    { actor, account: null },
    { actor, account: { id: 'opaque' } },
    { actor, canManageParticipants: true },
  ]) {
    const result = await createCatalogHttpReads(async () =>
      Response.json(body),
    ).readIdentitySession(scope);
    assert.equal(result.status, 'available');
    if (result.status === 'available')
      assert.deepEqual(result.value, {
        actor: 'actor' in body ? body.actor : null,
        hasAccount: 'account' in body && !!body.account,
        canManageParticipants:
          'canManageParticipants' in body && body.canManageParticipants === true,
      });
  }
  const local = await createCatalogHttpReads(async () =>
    Response.json({ projects: [workspace] }),
  ).listWorkspaceProjects(scope);
  assert.deepEqual(local, { status: 'available', value: [workspace] });
  const cloud = await createCatalogHttpReads(async () =>
    Response.json({ projects: [account] }),
  ).listAccountProjects(scope);
  assert.deepEqual(cloud, { status: 'available', value: [account] });
  await assert.rejects(
    createCatalogHttpReads(async () =>
      Response.json({ projects: [workspace] }),
    ).listAccountProjects(scope),
  );
  await assert.rejects(
    createCatalogHttpReads(async () =>
      Response.json({ projects: [account] }),
    ).listWorkspaceProjects(scope),
  );
});

test('CRP02 injected HTTP adapter owns exact URL, no-store, same-origin credentials and abort', async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [],
    cancellation = createClientCancellation();
  const reads = createCatalogHttpReads(async (url, init) => {
    seen.push({ url: String(url), init });
    return Response.json(String(url) === '/api/session' ? {} : { projects: [] });
  });
  await reads.readIdentitySession(scope, { signal: cancellation.signal });
  await reads.listWorkspaceProjects(scope);
  await reads.listAccountProjects(scope);
  assert.deepEqual(
    seen.map((value) => value.url),
    ['/api/session', '/api/projects', '/api/projects'],
  );
  for (const call of seen) {
    assert.equal(call.init?.cache, 'no-store');
    assert.equal(call.init.credentials, 'same-origin');
    assert.equal(call.init.redirect, 'error');
    assert(call.init.signal instanceof AbortSignal);
  }
  const pending = createCatalogHttpReads(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('fixture secret', 'AbortError')),
        );
      }),
  ).readIdentitySession(scope, { signal: cancellation.signal });
  cancellation.abort();
  await assert.rejects(
    pending,
    (error) =>
      error instanceof ClientError &&
      error.kind === 'cancelled' &&
      !error.message.includes('secret'),
  );
});

for (const body of [
  { projects: null },
  { projects: {} },
  { projects: [null] },
  { projects: [{ id: '', name: 'Invalid' }] },
  {
    projects: [
      { id: 'p', name: 'Invalid', slug: 'slug', createdAt: 'now', createdBy: null, role: 'Root' },
    ],
  },
])
  test('CRP02 rejects malformed catalog ' + JSON.stringify(body), async () => {
    await assert.rejects(
      createCatalogHttpReads(async () => Response.json(body)).listAccountProjects(scope),
      (error) => error instanceof ClientError && error.kind === 'contract',
    );
  });

test('CRP02 malformed JSON and access/nonaccess failures retain safe status priority', async () => {
  for (const status of [401, 403])
    await assert.rejects(
      createCatalogHttpReads(
        async () => new Response('SECRET-INVALID-JSON', { status }),
      ).readIdentitySession(scope),
      (error) =>
        error instanceof ClientError &&
        error.kind === 'access' &&
        error.status === status &&
        !error.message.includes('SECRET'),
    );
  await assert.rejects(
    createCatalogHttpReads(async () => new Response('SECRET-INVALID-JSON')).readIdentitySession(
      scope,
    ),
    (error) => error instanceof ClientError && error.kind === 'contract',
  );
  await assert.rejects(
    createCatalogHttpReads(async () =>
      Response.json({ error: { code: 'SECRET', message: 'SECRET' } }, { status: 500 }),
    ).listAccountProjects(scope),
    (error) =>
      error instanceof ClientError &&
      error.status === 500 &&
      error.kind === 'rejected' &&
      !error.message.includes('SECRET'),
  );
  await assert.rejects(
    createCatalogHttpReads(async () => {
      throw new Error('SECRET URL/cookie');
    }).readIdentitySession(scope),
    (error) =>
      error instanceof ClientError && error.kind === 'network' && !error.message.includes('SECRET'),
  );
  const redirect = Response.json({});
  Object.defineProperty(redirect, 'redirected', { value: true });
  await assert.rejects(
    createCatalogHttpReads(async () => redirect).readIdentitySession(scope),
    (error) => error instanceof ClientError && error.kind === 'contract',
  );
});
