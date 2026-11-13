import { createProjectSession } from '../../../../packages/client/src/lifecycle/project-session';
import { createProjectHttpPorts } from '../../../../packages/client/src/http/project-http';
import { freezeProjectCommandIntent } from '../../../../packages/client/src/ports';
import { getWorkspaceIntents } from '../../../../packages/client/src/http/workspace-intents';

/** Фиксирует проект, автора и исходный текст команды для проверки её квитанции. */
export type ReceiptProbeInput = {
  projectId: string;
  actorId: string;
  requestId: string;
  expectedVersion: number;
  body: string;
};
/** Управляет тестовой сессией и наблюдением её курсора и сохранённых незавершённых команд. */
export type ReceiptProbe = {
  configure(input: ReceiptProbeInput): void;
  execute(): Promise<string>;
  snapshot(): number | null;
  pending(): { requestId: string; body: string; status: string }[];
  dispose(): void;
};
declare global {
  interface Window {
    receiptProof: ReceiptProbe;
  }
}
let session: ReturnType<typeof createProjectSession> | undefined,
  intent: ReturnType<typeof freezeProjectCommandIntent> | undefined;

/** Fixture загружает настоящий client admission без product UI, React providers или дополнительного transport. */
window.receiptProof = {
  configure(input) {
    session?.dispose();
    const scope = { projectId: input.projectId, actorId: input.actorId, accessEpoch: 1 };
    intent = freezeProjectCommandIntent({
      scope,
      operation: 'execute-command',
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      body: input.body,
    });
    session = createProjectSession({
      sourceId: location.origin,
      scope,
      ports: (adopter) => createProjectHttpPorts({ scope, mode: 'legacy', adopter }),
    });
  },
  async execute() {
    if (!session || !intent) throw new Error('Fixture intent is missing');
    return (await session.execute(intent)).status;
  },
  snapshot() {
    return session?.getSnapshot()?.cursor ?? null;
  },
  pending() {
    return intent
      ? getWorkspaceIntents(intent.scope.projectId, intent.scope.actorId).map(
          ({ requestId, body, status }) => ({ requestId, body, status }),
        )
      : [];
  },
  dispose() {
    session?.dispose();
  },
};
