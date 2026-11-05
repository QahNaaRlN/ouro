'use client';

import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  projectSessionKey,
  type ProjectSession,
  type ProjectSessionView,
} from '@/packages/client/src/lifecycle/project-session';
import {
  freezeProjectCommandIntent,
  type ProjectClientScope,
  type ProjectCommandOperation,
  type FrozenProjectCommandIntent,
  type ProjectSnapshotDTO,
} from '@/packages/client/src/ports';
import {
  projectSnapshotQueryKey,
  projectReadQueryKey,
} from '@/packages/frontend/src/api/project-session';
import { ProjectRuntimeContext } from './ProjectRuntimeProvider';
import type { ProjectCommandPresentation } from '@/packages/client/src/lifecycle/project-command-presentation.types';

const emptyView: ProjectSessionView = {
  snapshot: null,
  metadata: null,
  status: 'connecting',
  error: null,
  active: false,
  busy: false,
};
const idleSubscribe = () => () => {};
/** Hook, который арендует ближайший project owner и читает его единую Query-проекцию. */
export function useProjectSession(
  scope: ProjectClientScope | undefined,
  mode: 'workspace' | 'legacy',
) {
  const runtime = useContext(ProjectRuntimeContext);
  if (!runtime) throw new Error('ProjectRuntimeProvider required');
  const projectId = scope?.projectId,
    actorId = scope?.actorId,
    accessEpoch = scope?.accessEpoch,
    hostEpoch = scope?.hostEpoch;
  const stableScope = useMemo(
    () =>
      projectId !== undefined && actorId !== undefined && accessEpoch !== undefined
        ? { projectId, actorId, accessEpoch, hostEpoch }
        : undefined,
    [projectId, actorId, accessEpoch, hostEpoch],
  );
  const client = useQueryClient(),
    [session, setSession] = useState<ProjectSession | null>(null),
    key = stableScope ? projectSessionKey('ouro:same-origin', stableScope) : null;
  useEffect(() => {
    if (!stableScope) {
      setSession(null);
      return;
    }
    const lease = runtime.acquire(stableScope, mode);
    setSession(lease.session);
    return () => {
      lease.release();
    };
  }, [runtime, stableScope, mode]);
  const current =
    session && key === projectSessionKey(session.sourceId, session.scope) ? session : null;
  const view = useSyncExternalStore(
    current?.subscribe ?? idleSubscribe,
    current?.getView ?? (() => emptyView),
    () => emptyView,
  );
  const snapshot = useQuery<ProjectSnapshotDTO>({
    queryKey: current ? projectSnapshotQueryKey(current) : ['project-snapshot', 'unbound'],
    enabled: false,
    structuralSharing: false,
    queryFn: async () => {
      throw new Error('Snapshot reads belong to ProjectSession');
    },
  }).data;
  const reading = useQuery({
    queryKey: current ? projectReadQueryKey(current, mode) : ['project-read', 'unbound', key, mode],
    enabled: !!current,
    queryFn: async () => {
      if (!current) throw new Error('No project session');
      const metadata = await current.refresh(mode === 'workspace');
      current.start();
      return { metadata, cursor: current.getSnapshot()?.cursor ?? 0 };
    },
    meta: { errorUi: 'inline', errorReportOwner: 'operation', suppressToast: true },
    retry: false,
    refetchInterval: mode === 'workspace' ? 8000 : false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    mutationKey: ['project-command', key],
    mutationFn: ({
      intent,
      presentation,
    }: {
      intent: FrozenProjectCommandIntent;
      presentation?: ProjectCommandPresentation;
    }) => {
      if (!current) throw new Error('No project session');
      return current.execute(intent, presentation);
    },
    meta: { errorUi: 'inline', errorReportOwner: 'operation', suppressToast: true },
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  });
  const execute = async (
    body: Record<string, unknown>,
    operation: ProjectCommandOperation = 'execute-command',
    presentation?: ProjectCommandPresentation,
  ) => {
    if (!current || !view.active) throw new Error('Дождитесь подтверждённого контекста проекта.');
    const version =
      typeof body.expectedVersion === 'number'
        ? body.expectedVersion
        : current.getSnapshot()?.cursor;
    if (version === undefined) throw new Error('Дождитесь состояния проекта.');
    const requestId = typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID(),
      intent = freezeProjectCommandIntent({
        scope: current.scope,
        operation,
        requestId,
        expectedVersion: version,
        body: JSON.stringify({ ...body, expectedVersion: version, requestId }),
      });
    return mutation.mutateAsync({ intent, presentation });
  };
  return {
    session: current,
    view,
    snapshot: current && view.active ? snapshot : undefined,
    reading,
    execute,
    refresh: () =>
      current
        ? client.fetchQuery({
            queryKey: projectReadQueryKey(current, mode),
            queryFn: async () => {
              const metadata = await current.refresh(mode === 'workspace');
              current.start();
              return { metadata, cursor: current.getSnapshot()?.cursor ?? 0 };
            },
            meta: { errorUi: 'inline', errorReportOwner: 'operation', suppressToast: true },
            staleTime: 0,
            retry: false,
          })
        : Promise.resolve(null),
  };
}
