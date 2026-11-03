import { createStore } from '../lib/store';
import { PROJECT_ID, type Actor } from '../packages/core/src';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const store = await createStore({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.OURO_DATA_DIR });
try {
  const operator: Actor = { id: 'local-human', kind: 'human', name: 'Bootstrap operator', projectIds: [PROJECT_ID] };
  const userId = process.env.OURO_OWNER_ID ?? (await store.createAccount({
    email: required('OURO_OWNER_EMAIL'),
    name: required('OURO_OWNER_NAME'),
    password: required('OURO_OWNER_PASSWORD'),
  }, operator)).account.id;
  const membership = await store.bootstrapProjectOwner(userId, operator);
  console.log(JSON.stringify({ ok: true, projectId: membership.projectId, userId: membership.userId, role: membership.role }));
} finally {
  await store.close();
}
