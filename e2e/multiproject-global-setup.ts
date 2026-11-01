import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store';
import { PROJECT_ID, type Actor } from '../packages/core/src';
import type { OuroMailer, ProjectRole } from '../lib/projects';

export const multiprojectFixturePath = join(tmpdir(), 'ouro-multiproject-e2e.json');
export type MultiprojectFixture = {
  owner: { email: string; password: string };
  contributor: { email: string; name: string; password: string; code: string };
  viewer: { email: string; name: string; password: string; code: string };
  first: { id: string; name: string };
  second: { id: string; name: string };
};

export default async function multiprojectGlobalSetup() {
  const runId = randomUUID().slice(0, 8);
  const password = 'correct horse battery staple';
  const invitations: { email: string; role: ProjectRole; code: string }[] = [];
  const mailer: OuroMailer = {
    sendInvitation: async input => { invitations.push(input); },
    sendPasswordReset: async () => {},
  };
  const store = await createStore({
    dataDir: process.env.OURO_E2E_DATA_DIR ?? join(tmpdir(), 'ouro-e2e-postgres'),
    seedEvents: [],
    mailer,
  });
  try {
    const account = (await store.createAccount({
      email: `owner-${runId}@example.com`, name: 'E2E Owner', password,
    }, { id: 'local-human', kind: 'human', name: 'Оператор', projectIds: [PROJECT_ID] })).account;
    const owner: Actor = { id: account.id, kind: 'human', name: account.name, projectIds: [] };
    const first = await store.createProject({ name: `E2E Alpha ${runId}` }, owner);
    const second = await store.createProject({ name: `E2E Beta ${runId}` }, owner);
    owner.projectIds = [first.id, second.id];
    const contributor = { email: `contributor-${runId}@example.com`, name: 'E2E Contributor', password };
    const viewer = { email: `viewer-${runId}@example.com`, name: 'E2E Viewer', password };
    await store.createInvitation(first.id, { email: contributor.email, role: 'Contributor' }, owner);
    await store.createInvitation(first.id, { email: viewer.email, role: 'Viewer' }, owner);
    const fixture: MultiprojectFixture = {
      owner: { email: account.email, password },
      contributor: { ...contributor, code: invitations.find(item => item.email === contributor.email)!.code },
      viewer: { ...viewer, code: invitations.find(item => item.email === viewer.email)!.code },
      first: { id: first.id, name: first.name },
      second: { id: second.id, name: second.name },
    };
    await writeFile(multiprojectFixturePath, JSON.stringify(fixture), { mode: 0o600 });
  } finally {
    await store.close();
  }
}
