import { z } from 'zod';
import type { ProjectMetadata } from '@ouro/protocol/http';
import type { CatalogReadPort } from '../ports/catalog-read.port';
import type { ClientCancellationSignal, WorkspaceProjectDTO } from '../ports/project.types';
import { ClientError } from '../ports/client-error.types';

const actor = z.object({
  id: z.string().min(1),
  kind: z.enum(['human', 'agent', 'service']),
  projectIds: z.array(z.string()),
  name: z.string().optional(),
});
const session = z.object({
  actor: actor.nullable().optional(),
  account: z.unknown().optional(),
  canManageParticipants: z.boolean().optional(),
});
const role = z.enum(['Owner', 'Contributor', 'Viewer']);
const accountProject: z.ZodType<ProjectMetadata> = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  role,
});
const workspaceProject: z.ZodType<WorkspaceProjectDTO> = z.object({
  id: z.string().min(1),
  name: z.string(),
  rootPath: z.string().nullable(),
  kind: z.enum(['folder', 'demo', 'hosted']),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  bindingId: z.string().nullable().optional(),
  rootIdentity: z.unknown().optional(),
  role: role.optional(),
});
const accountCatalog = z.object({ projects: z.array(accountProject) }),
  workspaceCatalog = z.object({ projects: z.array(workspaceProject) });
const invalid = () =>
  new ClientError('CATALOG_CONTRACT', 'Ответ чтения не соответствует контракту.', 'contract');

/** Связывает только три semantic reads с существующими same-origin session/catalog endpoints. */
export function createCatalogHttpReads(fetcher: typeof fetch = globalThis.fetch): CatalogReadPort {
  const read = async (
    url: '/api/session' | '/api/projects',
    signal?: ClientCancellationSignal,
  ): Promise<unknown> => {
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) abort();
    try {
      const response = await fetcher(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403)
        throw new ClientError(
          'CATALOG_ACCESS',
          'Нет доступа к текущей сессии или каталогу.',
          'access',
          response.status,
        );
      if (!response.ok)
        throw new ClientError(
          'CATALOG_REJECTED',
          'Не удалось прочитать сессию или каталог.',
          'rejected',
          response.status,
        );
      if (response.redirected) throw invalid();
      try {
        return await response.json();
      } catch {
        throw invalid();
      }
    } catch (error) {
      if (controller.signal.aborted)
        throw new ClientError('CANCELLED', 'Ожидание отменено.', 'cancelled');
      if (error instanceof ClientError) throw error;
      throw new ClientError(
        'CATALOG_NETWORK',
        'Не удалось получить подтверждённый ответ.',
        'network',
      );
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };
  return {
    readIdentitySession: async (_scope, options) => {
      const parsed = session.safeParse(await read('/api/session', options?.signal));
      if (!parsed.success) throw invalid();
      return {
        status: 'available',
        value: {
          actor: parsed.data.actor ?? null,
          hasAccount: !!parsed.data.account,
          canManageParticipants: parsed.data.canManageParticipants === true,
        },
      };
    },
    listWorkspaceProjects: async (_scope, options) => {
      const parsed = workspaceCatalog.safeParse(await read('/api/projects', options?.signal));
      if (!parsed.success) throw invalid();
      return { status: 'available', value: parsed.data.projects };
    },
    listAccountProjects: async (_scope, options) => {
      const parsed = accountCatalog.safeParse(await read('/api/projects', options?.signal));
      if (!parsed.success) throw invalid();
      return { status: 'available', value: parsed.data.projects };
    },
  };
}
