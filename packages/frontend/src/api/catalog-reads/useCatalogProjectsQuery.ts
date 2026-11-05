'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientError, type CatalogReadScope } from '../../../../client/src/ports';
import { useCatalogReadEnvironment } from '../../shared/catalog-read-environment';
import { createClientCancellation } from '../../../../client/src/lifecycle/create-client-cancellation';
import {
  catalogReadQueryKey,
  workspaceProjectsQueryOptions,
  accountProjectsQueryOptions,
  fetchCatalogRead,
  cancelInactiveCatalogRead,
} from './catalog-read.query';
import { catalogReadView } from './catalog-read-view';

/** Наблюдает один из двух каталогов; оба Query сохраняют стабильный порядок React вызовов. */
export function useCatalogProjectsQuery(
  input: CatalogReadScope,
  kind: 'workspace' | 'account',
  enabled: boolean,
) {
  const { sourceId, ownerId, actorId, projectId, accessEpoch, hostEpoch } = input;
  const scope = useMemo(
    () => ({ sourceId, ownerId, actorId, projectId, accessEpoch, hostEpoch }),
    [sourceId, ownerId, actorId, projectId, accessEpoch, hostEpoch],
  );
  const environment = useCatalogReadEnvironment(),
    client = useQueryClient();
  const valid =
    !!environment &&
    environment.sourceId === scope.sourceId &&
    environment.hostEpoch === scope.hostEpoch;
  const lifetime = useMemo(
      () => ({
        context: { environment, scope, kind, enabled },
        active: true,
        pending: new Set<ReturnType<typeof createClientCancellation>>(),
      }),
      [environment, scope, kind, enabled],
    ),
    current = useRef(lifetime);
  current.current = lifetime;
  useEffect(() => {
    lifetime.active = true;
    return () => {
      lifetime.active = false;
      lifetime.pending.forEach((value) => value.abort());
      lifetime.pending.clear();
    };
  }, [lifetime]);
  const workspace = useQuery(
    environment
      ? {
          ...workspaceProjectsQueryOptions(environment, scope),
          enabled: valid && enabled && kind === 'workspace',
        }
      : {
          queryKey: catalogReadQueryKey('list-workspace-projects', scope),
          enabled: false,
          queryFn: async () => ({
            status: 'unsupported' as const,
            capability: 'list-workspace-projects' as const,
          }),
        },
  );
  const account = useQuery(
    environment
      ? {
          ...accountProjectsQueryOptions(environment, scope),
          enabled: valid && enabled && kind === 'account',
        }
      : {
          queryKey: catalogReadQueryKey('list-account-projects', scope),
          enabled: false,
          queryFn: async () => ({
            status: 'unsupported' as const,
            capability: 'list-account-projects' as const,
          }),
        },
  );
  useEffect(() => {
    if (!valid || !enabled || kind !== 'workspace')
      cancelInactiveCatalogRead(client, catalogReadQueryKey('list-workspace-projects', scope));
    if (!valid || !enabled || kind !== 'account')
      cancelInactiveCatalogRead(client, catalogReadQueryKey('list-account-projects', scope));
  }, [client, scope, kind, enabled, valid]);
  const refresh = useCallback(async () => {
    const { environment, scope, kind, enabled } = lifetime.context;
    if (!enabled || !environment || !valid)
      throw new ClientError('CATALOG_UNAVAILABLE', 'Чтение каталога недоступно.', 'rejected');
    if (current.current !== lifetime || !lifetime.active)
      throw new ClientError('CANCELLED', 'Ожидание отменено.', 'cancelled');
    const cancellation = createClientCancellation();
    lifetime.pending.add(cancellation);
    try {
      const result =
        kind === 'workspace'
          ? await fetchCatalogRead(
              client,
              workspaceProjectsQueryOptions(environment, scope),
              cancellation.signal,
            )
          : await fetchCatalogRead(
              client,
              accountProjectsQueryOptions(environment, scope),
              cancellation.signal,
            );
      if (current.current !== lifetime || !lifetime.active || cancellation.signal.aborted)
        throw new ClientError('CANCELLED', 'Ожидание отменено.', 'cancelled');
      if (result.status === 'unsupported')
        throw new ClientError('CATALOG_UNAVAILABLE', 'Чтение каталога недоступно.', 'rejected');
      return result.value;
    } finally {
      lifetime.pending.delete(cancellation);
    }
  }, [client, valid, lifetime]);
  return {
    workspace: catalogReadView(workspace, enabled && kind === 'workspace', valid),
    account: catalogReadView(account, enabled && kind === 'account', valid),
    refresh,
  };
}
