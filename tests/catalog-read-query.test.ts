import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  ClientError,
  type CatalogReadPort,
  type CatalogReadScope,
  type IdentitySessionDTO,
  type ClientErrorOccurrence,
} from '../packages/client/src/ports';
import { createClientCancellation } from '../packages/client/src/lifecycle/create-client-cancellation';
import { createIdentityReadController } from '../packages/client/src/lifecycle/create-identity-read-controller';
import {
  catalogReadQueryKey,
  identitySessionQueryOptions,
  accountProjectsQueryOptions,
  workspaceProjectsQueryOptions,
  fetchCatalogRead,
  normalizeCatalogReadError,
  catalogReadView,
} from '../packages/frontend/src/api/catalog-reads';
import { cancelInactiveCatalogRead } from '../packages/frontend/src/api/catalog-reads/catalog-read.query';

const scope: CatalogReadScope = {
  sourceId: 'fixture:A',
  ownerId: 'owner-A',
  actorId: 'actor',
  projectId: 'project',
  accessEpoch: 1,
  hostEpoch: 1,
};
const identity: IdentitySessionDTO = {
  actor: { id: 'opaque', kind: 'human', projectIds: [] },
  hasAccount: true,
  canManageParticipants: false,
};
const deferred = <T>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Uninitialized fixture');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};
/** Составляет semantic fixture без HTTP, credential и фоновых listeners. */
const reader = (
  read: CatalogReadPort['readIdentitySession'] = async () => ({
    status: 'available',
    value: identity,
  }),
): CatalogReadPort => ({
  readIdentitySession: read,
  listWorkspaceProjects: async () => ({ status: 'available', value: [] }),
  listAccountProjects: async () => ({ status: 'available', value: [] }),
});

test('CRP01 three semantic reads use injected reader while ambient HTTP is unavailable', async () => {
  const client = new QueryClient(),
    previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Ambient HTTP forbidden');
  };
  const seen: string[] = [],
    ports = reader(async (input) => {
      assert.equal(input, scope);
      seen.push('identity');
      return { status: 'available', value: identity };
    });
  ports.listWorkspaceProjects = async (input) => {
    assert.equal(input, scope);
    seen.push('workspace');
    return { status: 'available', value: [] };
  };
  ports.listAccountProjects = async (input) => {
    assert.equal(input, scope);
    seen.push('account');
    return { status: 'available', value: [] };
  };
  const environment = { sourceId: scope.sourceId, hostEpoch: 1, reads: ports };
  try {
    assert.deepEqual(
      await fetchCatalogRead(client, identitySessionQueryOptions(environment, scope)),
      { status: 'available', value: identity },
    );
    assert.deepEqual(
      await fetchCatalogRead(client, workspaceProjectsQueryOptions(environment, scope)),
      { status: 'available', value: [] },
    );
    assert.deepEqual(
      await fetchCatalogRead(client, accountProjectsQueryOptions(environment, scope)),
      { status: 'available', value: [] },
    );
    assert.deepEqual(seen, ['identity', 'workspace', 'account']);
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally {
    globalThis.fetch = previous;
    client.clear();
  }
});

test('CRP03 keys isolate actor, project, source, access/host epochs and independent identity owners', () => {
  const key = catalogReadQueryKey('read-identity-session', scope);
  for (const patch of [
    { actorId: 'B' },
    { projectId: 'B' },
    { sourceId: 'B' },
    { accessEpoch: 2 },
    { hostEpoch: 2 },
    { ownerId: 'B' },
  ])
    assert.notDeepEqual(catalogReadQueryKey('read-identity-session', { ...scope, ...patch }), key);
  assert.notDeepEqual(catalogReadQueryKey('list-account-projects', scope), key);
});

test('CRP03 last imperative reader cancels/removes its exact query; late ignored-abort reply cannot restore it', async () => {
  const client = new QueryClient(),
    old = deferred<{ status: 'available'; value: IdentitySessionDTO }>(),
    cancel = createClientCancellation();
  let aborted = false;
  const projectKey = ['project-snapshot', 'unrelated-owner'],
    projectView = { cursor: 77 };
  client.setQueryData(projectKey, projectView);
  const environment = {
    sourceId: scope.sourceId,
    hostEpoch: 1,
    reads: reader(async (_input, options) => {
      options?.signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return old.promise;
    }),
  };
  const options = identitySessionQueryOptions(environment, scope),
    pending = fetchCatalogRead(client, options, cancel.signal);
  cancel.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof ClientError && error.kind === 'cancelled',
  );
  assert.equal(aborted, true);
  assert.equal(client.getQueryData(options.queryKey), undefined);
  old.resolve({ status: 'available', value: identity });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.getQueryData(options.queryKey), undefined);
  assert.equal(client.getQueryData(projectKey), projectView);
  client.clear();
});

test('CRP03 one imperative waiter cannot cancel a second current same-key reader', async () => {
  const client = new QueryClient(),
    response = deferred<{ status: 'available'; value: IdentitySessionDTO }>(),
    cancel = createClientCancellation();
  let calls = 0,
    aborted = false;
  const environment = {
      sourceId: scope.sourceId,
      hostEpoch: 1,
      reads: reader(async (_input, options) => {
        calls++;
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return response.promise;
      }),
    },
    options = identitySessionQueryOptions(environment, scope);
  const first = fetchCatalogRead(client, options, cancel.signal),
    second = fetchCatalogRead(client, options);
  cancel.abort();
  await assert.rejects(first);
  assert.equal(calls, 1);
  assert.equal(aborted, false);
  response.resolve({ status: 'available', value: identity });
  assert.equal((await second).status, 'available');
  assert.equal(client.getQueryCache().getAll().length, 0);
  client.clear();
});

test('CRP03 releasing one observed reader preserves its shared query and cancellation belongs to the last', async () => {
  const client = new QueryClient(),
    response = deferred<{ status: 'available'; value: IdentitySessionDTO }>();
  let calls = 0,
    aborted = false;
  const environment = {
      sourceId: scope.sourceId,
      hostEpoch: 1,
      reads: reader(async (_input, options) => {
        calls++;
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return response.promise;
      }),
    },
    options = identitySessionQueryOptions(environment, scope);
  const first = new QueryObserver(client, options),
    second = new QueryObserver(client, options),
    offFirst = first.subscribe(() => {}),
    offSecond = second.subscribe(() => {});
  offFirst();
  assert.equal(aborted, false);
  assert.equal(calls, 1);
  offSecond();
  assert.equal(aborted, true);
  response.resolve({ status: 'available', value: identity });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(client.getQueryData(options.queryKey), undefined);
  client.clear();
});

test('CRP03 unmounting the last panel cannot cancel its still-current imperative refresh waiter', async () => {
  const client = new QueryClient(),
    response = deferred<{ status: 'available'; value: IdentitySessionDTO }>();
  let aborted = false;
  const environment = {
      sourceId: scope.sourceId,
      hostEpoch: 1,
      reads: reader((_input, options) => {
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return response.promise;
      }),
    },
    options = identitySessionQueryOptions(environment, scope);
  const observer = new QueryObserver(client, options),
    off = observer.subscribe(() => {}),
    pending = fetchCatalogRead(client, options).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  off();
  response.resolve({ status: 'available', value: identity });
  const outcome = await pending;
  client.clear();
  assert.equal(aborted, false, 'an imperative reader still owns this exact query');
  assert.deepEqual(outcome, { value: { status: 'available', value: identity } });
});

test('CRP03 disabling one observer cannot cancel another enabled reader; all-disabled cancels owned pending work', () => {
  const client = new QueryClient();
  let aborted = false;
  const environment = {
      sourceId: scope.sourceId,
      hostEpoch: 1,
      reads: reader(
        (_scope, options) =>
          new Promise(() => {
            options?.signal?.addEventListener('abort', () => {
              aborted = true;
            });
          }),
      ),
    },
    options = identitySessionQueryOptions(environment, scope);
  const first = new QueryObserver(client, options),
    second = new QueryObserver(client, options),
    offFirst = first.subscribe(() => {}),
    offSecond = second.subscribe(() => {});
  first.setOptions({ ...options, enabled: false });
  cancelInactiveCatalogRead(client, options.queryKey);
  assert.equal(aborted, false);
  second.setOptions({ ...options, enabled: false });
  cancelInactiveCatalogRead(client, options.queryKey);
  assert.equal(aborted, true);
  offFirst();
  offSecond();
  client.clear();
});

for (const [label, patch] of [
  ['actor', { actorId: 'B' }],
  ['access epoch', { accessEpoch: 2 }],
  ['host epoch', { hostEpoch: 2 }],
  ['source', { sourceId: 'fixture:B' }],
  ['owner', { ownerId: 'owner-B' }],
] as const)
  test('CRP03 late ' + label + ' read cannot populate the new scope', async () => {
    const client = new QueryClient(),
      old = deferred<{ status: 'available'; value: IdentitySessionDTO }>(),
      cancel = createClientCancellation();
    const before = identitySessionQueryOptions(
        { sourceId: scope.sourceId, hostEpoch: 1, reads: reader(() => old.promise) },
        scope,
      ),
      nextScope = { ...scope, ...patch },
      after = identitySessionQueryOptions(
        { sourceId: nextScope.sourceId, hostEpoch: nextScope.hostEpoch, reads: reader() },
        nextScope,
      );
    const pending = fetchCatalogRead(client, before, cancel.signal);
    cancel.abort();
    await assert.rejects(pending);
    const observer = new QueryObserver(client, after),
      off = observer.subscribe(() => {});
    await client.fetchQuery(after);
    old.resolve({
      status: 'available',
      value: { ...identity, actor: { id: 'foreign', kind: 'human', projectIds: [] } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(client.getQueryData(after.queryKey), { status: 'available', value: identity });
    assert.equal(client.getQueryData(before.queryKey), undefined);
    off();
    client.clear();
  });

test('CRP03 same actor reauthentication still requires a fresh identity ticket and rejects old completion', async () => {
  const client = new QueryClient(),
    controller = createIdentityReadController();
  controller.mount();
  const old = deferred<{ status: 'available'; value: IdentitySessionDTO }>();
  const environment = { sourceId: scope.sourceId, hostEpoch: 1, reads: reader(() => old.promise) },
    first = controller.begin();
  assert(first);
  const pending = first.run((signal) =>
    fetchCatalogRead(
      client,
      identitySessionQueryOptions(environment, { ...scope, accessEpoch: first.accessEpoch }),
      signal,
    ),
  );
  const next = controller.begin();
  assert(next);
  const current = await next.run((signal) =>
    fetchCatalogRead(
      client,
      identitySessionQueryOptions(
        { ...environment, reads: reader() },
        { ...scope, accessEpoch: next.accessEpoch },
      ),
      signal,
    ),
  );
  assert.equal(current.status, 'accepted');
  old.resolve({ status: 'available', value: identity });
  assert.equal((await pending).status, 'superseded');
  controller.unmount();
  client.clear();
});

test('CRP04 unsupported remains unavailable, disabled remains idle, empty available list finishes loading', () => {
  const base = { data: undefined, error: null, isFetching: false, isPending: true };
  assert.equal(catalogReadView(base, false).status, 'idle');
  assert.equal(catalogReadView(base, true, false).status, 'unavailable');
  assert.equal(
    catalogReadView(
      { ...base, data: { status: 'unsupported', capability: 'list-account-projects' } },
      true,
    ).status,
    'unavailable',
  );
  assert.deepEqual(catalogReadView({ ...base, data: { status: 'available', value: [] } }, true), {
    status: 'ready',
    data: [],
    error: null,
    refreshing: false,
  });
  assert.equal(catalogReadView({ ...base, isFetching: true }, true).status, 'loading');
  const error = new ClientError('CATALOG_NETWORK', 'Safe', 'network');
  assert.equal(
    catalogReadView(
      { ...base, data: { status: 'available', value: ['current'] }, error, isFetching: true },
      true,
    ).status,
    'ready',
  );
});

test('CRP04 retry0 and explicit freshness do not create polling or retain a finished imperative identity', async () => {
  const client = new QueryClient();
  let reads = 0;
  const environment = {
      sourceId: scope.sourceId,
      hostEpoch: 1,
      reads: reader(async () => {
        reads++;
        return { status: 'available', value: identity };
      }),
    },
    options = identitySessionQueryOptions(environment, scope);
  assert.equal(options.retry, false);
  assert.equal(options.staleTime, 0);
  assert.equal(options.gcTime, 0);
  assert.equal(options.refetchInterval, false);
  assert.equal(options.refetchOnReconnect, false);
  assert.equal(options.refetchOnWindowFocus, false);
  await fetchCatalogRead(client, options);
  await fetchCatalogRead(client, options);
  assert.equal(reads, 2);
  client.clear();
});

for (const failure of ['throw', 'reject'] as const)
  test(
    'CRP04 safe reporter ' + failure + ' cannot replace error or leak raw message/credentials',
    async () => {
      const client = new QueryClient(),
        events: ClientErrorOccurrence[] = [],
        secret = 'SECRET-cookie-payload';
      let calls = 0;
      const environment = {
        sourceId: 'https://secret.invalid/?token=' + secret,
        reads: reader(async () => {
          calls++;
          throw new ClientError(secret, secret, 'access', 403);
        }),
        reporter: {
          report: (event: ClientErrorOccurrence) => {
            events.push(event);
            if (failure === 'throw') throw new Error(secret);
            return Promise.reject(new Error(secret));
          },
        },
      };
      const input = { ...scope, sourceId: environment.sourceId, hostEpoch: undefined };
      await assert.rejects(
        fetchCatalogRead(client, identitySessionQueryOptions(environment, input)),
        (error) =>
          error instanceof ClientError &&
          error.code === 'CATALOG_ACCESS' &&
          error.status === 403 &&
          !error.message.includes(secret),
      );
      await Promise.resolve();
      assert.equal(calls, 1);
      assert.equal(events.length, 1);
      assert(!JSON.stringify(events).includes(secret));
      assert.equal(events[0].sourceId, 'untrusted-source');
      client.clear();
    },
  );

test('CRP04 pure normalizer has no reporting side effects and strips raw error details', () => {
  assert.equal(
    normalizeCatalogReadError(new Error('SECRET')).message,
    'Не удалось получить подтверждённый ответ.',
  );
});
