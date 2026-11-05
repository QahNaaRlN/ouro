import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { createProjectHandlers } from '../lib/project-http';
import { createUserAuthHandlers } from '../lib/user-auth-http';
import { createParticipantHandlers } from '../lib/participant-http';
import { createCatalogHttpReads } from '../packages/client/src/http/create-catalog-http-reads';
import { PROJECT_ID, type Actor } from '../packages/core/src';

test('CRP02 adapter accepts actual SQL-backed account/session and operator workspace contracts without coercion', async () => {
  const previous = process.env.OURO_LOCAL_DEMO;
  process.env.OURO_LOCAL_DEMO = '1';
  const store = await createStore({ dataDir: 'memory://', seedEvents: [] }),
    operator: Actor = { id: 'local-human', kind: 'human', projectIds: [PROJECT_ID] },
    scope = {
      ownerId: 'server-fixture',
      sourceId: 'same-origin-fixture',
      actorId: null,
      projectId: null,
      accessEpoch: 1,
    };
  try {
    const account = (
      await store.createAccount(
        {
          email: 'catalog@example.test',
          name: 'Catalog fixture',
          password: 'own-fixture-password',
        },
        operator,
      )
    ).account;
    const login = await store.authenticate(account.email, 'own-fixture-password');
    assert(login);
    const project = await store.createProject({ name: 'Owned account project' }, login.actor),
      projects = createProjectHandlers({ getStore: async () => store }),
      auth = createUserAuthHandlers({ getAuth: async () => store });
    const accountReads = createCatalogHttpReads(async (url, init) => {
      const request = new Request('http://127.0.0.1' + String(url), {
        ...init,
        headers: { cookie: 'ouro_user_session=' + login.token },
      });
      return String(url) === '/api/session'
        ? auth.session(request)
        : projects.listProjects(request);
    });
    const session = await accountReads.readIdentitySession(scope);
    assert.equal(session.status, 'available');
    if (session.status === 'available') {
      assert.equal(session.value.actor?.id, account.id);
      assert.equal(session.value.hasAccount, true);
      assert.equal(session.value.canManageParticipants, false);
      assert(!JSON.stringify(session).includes(login.token));
      assert(!('account' in session.value));
    }
    const catalog = await accountReads.listAccountProjects({ ...scope, actorId: account.id });
    assert.equal(catalog.status, 'available');
    if (catalog.status === 'available') {
      assert(catalog.value.some((value) => value.id === project.id && value.role === 'Owner'));
      assert.equal(typeof catalog.value[0].slug, 'string');
    }
    await assert.rejects(accountReads.listWorkspaceProjects(scope));
    const participant = createParticipantHandlers({ getRegistry: async () => store });
    const localReads = createCatalogHttpReads(async (url, init) =>
      String(url) === '/api/session'
        ? participant.session(new Request('http://127.0.0.1/api/session', init))
        : Response.json({ projects: await store.listWorkspaceProjects(operator) }),
    );
    const local = await localReads.readIdentitySession(scope);
    assert.equal(local.status, 'available');
    if (local.status === 'available') {
      assert.equal(local.value.hasAccount, false);
      assert.equal(local.value.canManageParticipants, true);
    }
    const folders = await localReads.listWorkspaceProjects({ ...scope, actorId: operator.id });
    assert.equal(folders.status, 'available');
    if (folders.status === 'available')
      assert(
        folders.value.some(
          (value) => value.id === PROJECT_ID && value.kind === 'demo' && value.rootPath === null,
        ),
      );
    await assert.rejects(localReads.listAccountProjects(scope));
  } finally {
    await store.close();
    if (previous === undefined) delete process.env.OURO_LOCAL_DEMO;
    else process.env.OURO_LOCAL_DEMO = previous;
  }
});
