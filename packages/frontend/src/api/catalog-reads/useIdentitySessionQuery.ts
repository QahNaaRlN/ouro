'use client';

import { useCallback, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogReadScope, ClientCancellationSignal } from '../../../../client/src/ports';
import { useCatalogReadEnvironment } from '../../shared/catalog-read-environment';
import {
  catalogReadScope,
  identitySessionQueryOptions,
  accountProjectsQueryOptions,
  fetchCatalogRead,
} from './catalog-read.query';

/** Даёт существующему identity controller fresh Query read без автоматической второй проверки. */
export function useIdentitySessionQuery() {
  const client = useQueryClient(),
    environment = useCatalogReadEnvironment(),
    ownerId = useId();
  const read = useCallback(
    async (
      input: { accessEpoch: number; projectId: string | null },
      signal: ClientCancellationSignal,
    ) => {
      if (!environment)
        return { status: 'unsupported' as const, capability: 'read-identity-session' as const };
      return fetchCatalogRead(
        client,
        identitySessionQueryOptions(
          environment,
          catalogReadScope(environment, ownerId, { ...input, actorId: null }),
        ),
        signal,
      );
    },
    [client, environment, ownerId],
  );
  const scope = useCallback(
    (input: {
      accessEpoch: number;
      projectId: string | null;
      actorId: string | null;
    }): CatalogReadScope =>
      environment
        ? catalogReadScope(environment, ownerId, input)
        : { ...input, ownerId, sourceId: 'unavailable' },
    [environment, ownerId],
  );
  const readAccountProjects = useCallback(
    async (input: CatalogReadScope, signal: ClientCancellationSignal) =>
      environment
        ? fetchCatalogRead(client, accountProjectsQueryOptions(environment, input), signal)
        : { status: 'unsupported' as const, capability: 'list-account-projects' as const },
    [client, environment],
  );
  return { read, scope, readAccountProjects };
}
