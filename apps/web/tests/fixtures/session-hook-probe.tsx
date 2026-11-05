import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createProjectRuntime } from '@/packages/frontend/src/app/project-runtime';
import { ProjectRuntimeContext } from '@/components/ProjectRuntimeProvider';
import { useProjectSession } from '@/components/useProjectSession';
import { replay } from '@/packages/core/src';
import type { ProjectClientScope, ProjectSnapshotDTO } from '@/packages/client/src/ports';

type Pending = {
  scope: ProjectClientScope;
  resolve: (value: { status: 'available'; value: ProjectSnapshotDTO }) => void;
};
type Probe = {
  configure(scope: ProjectClientScope | undefined): void;
  refresh(): void;
  resolve(index: number): void;
  metrics(): {
    acquired: number;
    released: number;
    subscriptions: number;
    closed: number;
    reads: number;
  };
};
declare global {
  interface Window {
    sessionHookProbe: Probe;
  }
}
const pending: Pending[] = [];
let acquired = 0,
  released = 0,
  subscriptions = 0,
  closed = 0;
const actual = createProjectRuntime({
  sourceId: 'ouro:same-origin',
  reporter: { report: () => {} },
  listenConnectivity: () => () => {},
  ports: () => ({
    read: {
      readSnapshot: (scope) => new Promise((resolve) => pending.push({ scope, resolve })),
      readWorkspace: async () => ({ status: 'unsupported', capability: 'read-workspace' }),
    },
    command: { execute: async () => ({ status: 'unknown', reason: 'transport' }) },
    subscription: {
      subscribe: () => {
        subscriptions++;
        return {
          close: () => {
            closed++;
          },
          reconnect: () => {},
        };
      },
    },
  }),
});
const runtime = {
  ...actual,
  acquire: (...args: Parameters<typeof actual.acquire>) => {
    acquired++;
    const lease = actual.acquire(...args);
    return {
      session: lease.session,
      release: () => {
        released++;
        lease.release();
      },
    };
  },
};
let configure: Probe['configure'] = () => {
  throw new Error('Fixture not mounted');
};
let refresh: Probe['refresh'] = () => {
  throw new Error('Fixture not mounted');
};
window.sessionHookProbe = {
  configure: (scope) => configure(scope),
  refresh: () => refresh(),
  resolve: (index) => {
    const entry = pending[index];
    if (!entry) throw new Error('Missing owned read');
    entry.resolve({
      status: 'available',
      value: { state: replay([], entry.scope.projectId), cursor: 0 },
    });
  },
  metrics: () => ({ acquired, released, subscriptions, closed, reads: pending.length }),
};

/** Наблюдает настоящий session hook с внедрёнными test-only semantic ports, без сетевого SSE. */
function SessionPane({ scope }: { scope: ProjectClientScope | undefined }) {
  const owner = useProjectSession(scope ? { ...scope } : undefined, 'legacy'),
    [draft, setDraft] = useState('');
  refresh = () => {
    void owner.refresh().catch(() => {});
  };
  return (
    <>
      <label>
        Session draft
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <output data-testid="session-id">{owner.session?.id ?? '-'}</output>
      <output data-testid="snapshot-project">{owner.snapshot?.state.projectId ?? '-'}</output>
    </>
  );
}
/** Заменяет только значения scope; runtime и Query owner остаются прежними. */
function Fixture() {
  const [scope, setScope] = useState<ProjectClientScope | undefined>({
    projectId: 'project-A',
    actorId: 'actor-A',
    accessEpoch: 1,
    hostEpoch: 1,
  });
  configure = (value) => setScope(value ? { ...value } : undefined);
  return (
    <ProjectRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>
        <SessionPane scope={scope} />
      </QueryClientProvider>
    </ProjectRuntimeContext.Provider>
  );
}
const element = document.getElementById('root');
if (!element) throw new Error('Fixture root is missing');
createRoot(element).render(<Fixture />);
