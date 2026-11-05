import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createStore, canonicalJSON } from '../lib/store';
import type { ProjectState } from '../packages/core/src';

/** Публикует только synthetic fixture после закрытия seed owner; затем Next единолично открывает профиль. */
async function main() {
  const dataDir = process.env.OURO_RECEIPT_BROWSER_PROFILE,
    manifest = process.env.OURO_RECEIPT_BROWSER_MANIFEST,
    port = process.env.OURO_RECEIPT_BROWSER_API_PORT;
  if (!dataDir || !manifest || !port)
    throw new Error('Receipt browser fixture requires its own profile, manifest and port.');
  const store = await createStore({ dataDir });
  try {
    const state = JSON.parse(JSON.stringify(await store.getProject())) as ProjectState,
      actor = state.events[0].actor,
      credential = 'ouro_human_' + randomBytes(32).toString('base64url');
    await store.inspect(
      'INSERT INTO ouro_participant_registrations(id,project_id,name,created_by) VALUES($1,$2,$3,$1)',
      [actor.id, state.projectId, 'Browser historical author'],
    );
    await store.inspect(
      'INSERT INTO ouro_participant_credentials(participant_id,credential_hash) VALUES($1,$2)',
      [actor.id, createHash('sha256').update(credential).digest('hex')],
    );
    const content = {
      title: 'Browser fresh provenance',
      goal: 'Prove actual COMMIT before a lost browser response.',
      dod: [{ id: 'durable', text: 'Exactly one command is committed', required: true }],
      constraints: '',
      assumptions: '',
      risks: '',
      inputs: '',
      comment: '',
    };
    const historical = {
        type: 'createSpec',
        requestId: randomUUID(),
        expectedVersion: state.version,
        content: state.revisions[0],
      },
      legacy: Record<string, unknown> = { ...state };
    for (const key of [
      'verificationRuns',
      'verificationReviews',
      'verificationSlices',
      'verificationPhases',
      'verificationCycles',
      'verificationRefactorAdmissions',
      'verificationObservationConfigs',
      'verificationObservations',
    ])
      if (Array.isArray(legacy[key]) && legacy[key].length === 0) delete legacy[key];
    const response = { state: legacy, events: [], cursor: state.version };
    await store.inspect(
      'INSERT INTO ouro_command_receipts(actor_id,project_id,request_id,payload_hash,response,cursor) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
      [
        actor.id,
        state.projectId,
        historical.requestId,
        createHash('sha256').update(canonicalJSON(historical)).digest('hex'),
        JSON.stringify(response),
        state.version,
      ],
    );
    const fresh = {
      type: 'createSpec',
      requestId: randomUUID(),
      expectedVersion: state.version,
      content,
    };
    await writeFile(
      manifest,
      JSON.stringify({
        actor,
        projectId: state.projectId,
        credential,
        historical: {
          requestId: historical.requestId,
          expectedVersion: state.version,
          body: ' ' + JSON.stringify(historical) + ' ',
        },
        fresh: {
          requestId: fresh.requestId,
          expectedVersion: state.version,
          body: '\n' + JSON.stringify(fresh) + '  ',
        },
      }),
      { mode: 0o600 },
    );
  } finally {
    await store.close();
  }
  process.env.OURO_DATA_DIR = dataDir;
  process.env.OURO_LOCAL_DEMO = '1';
  const cli = createRequire(import.meta.url).resolve('next/dist/bin/next');
  process.argv = [process.execPath, cli, 'start', '--hostname', '127.0.0.1', '--port', port];
  await import(pathToFileURL(cli).href);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
