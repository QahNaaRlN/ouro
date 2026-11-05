import {
  createProjectSessionRegistry,
  type ProjectSession,
  type ProjectSessionOptions,
} from '@/packages/client/src/lifecycle/project-session';
import type { ProjectSnapshotAdopter } from '@/packages/client/src/lifecycle/project-snapshot';
import type { ProjectCommandPresentationLookup } from '@/packages/client/src/lifecycle/project-command-presentation.types';
import type { ProjectClientScope, ErrorReporterPort } from '@/packages/client/src/ports';
import {
  createProjectQueryClient,
  bindProjectSessionQuery,
  projectReadQueryKey,
} from '@/packages/frontend/src/api/project-session';

/** Тип, описывающий внедрение семантических портов без выбора конкретного транспорта. */
export type ProjectRuntimePortFactory = (
  input: Readonly<{
    scope: ProjectClientScope;
    mode: 'workspace' | 'legacy';
    adopter: ProjectSnapshotAdopter;
    commandPresentation: ProjectCommandPresentationLookup;
  }>,
) => ReturnType<ProjectSessionOptions['ports']>;
/** Тип, описывающий явно выбранное оболочкой окружение одного runtime. */
export type ProjectRuntimeOptions = Readonly<{
  sourceId: string;
  ports: ProjectRuntimePortFactory;
  reporter: ErrorReporterPort;
  listenConnectivity: (reconnect: () => void) => () => void;
}>;
/** Утилита, которая собирает переносимый runtime без неявного транспорта и browser globals. */
export function createProjectRuntime(options: ProjectRuntimeOptions) {
  if (
    !options ||
    typeof options.sourceId !== 'string' ||
    !options.sourceId.length ||
    typeof options.ports !== 'function' ||
    typeof options.reporter?.report !== 'function' ||
    typeof options.listenConnectivity !== 'function'
  )
    throw new TypeError(
      'Project runtime requires an explicit source, semantic ports, reporter and connectivity listener.',
    );
  const { sourceId, ports, reporter, listenConnectivity } = options;
  const queryClient = createProjectQueryClient({ reporter }),
    registry = createProjectSessionRegistry(),
    bindings = new Map<ProjectSession, { count: number; close: () => void }>();
  return {
    queryClient,
    acquire: (scope: ProjectClientScope, mode: 'workspace' | 'legacy') => {
      const lease = registry.acquire({
        sourceId,
        scope,
        ports: (adopter, commandPresentation) =>
          ports({ scope, mode, adopter, commandPresentation }),
        reporter,
      });
      let binding = bindings.get(lease.session);
      if (!binding) {
        let closeProjection: (() => void) | undefined;
        try {
          closeProjection = bindProjectSessionQuery(queryClient, lease.session);
          const stopProjection = closeProjection,
            reconnect = () => lease.session.reconnect(),
            readKey = projectReadQueryKey(lease.session),
            closeConnectivity = listenConnectivity(reconnect);
          binding = {
            count: 0,
            close: () => {
              try {
                closeConnectivity();
              } finally {
                stopProjection();
                void queryClient.cancelQueries({ queryKey: readKey }).catch(() => {});
                queryClient.removeQueries({ queryKey: readKey });
              }
            },
          };
          bindings.set(lease.session, binding);
        } catch (error) {
          const failures: unknown[] = [];
          for (const close of [closeProjection, lease.release]) {
            try {
              close?.();
            } catch (failure) {
              failures.push(failure);
            }
          }
          if (failures.length)
            throw new AggregateError(
              [error, ...failures],
              'Project runtime setup and cleanup failed.',
            );
          throw error;
        }
      }
      binding.count++;
      let released = false;
      return {
        session: lease.session,
        release: () => {
          if (released) return;
          released = true;
          try {
            if (--binding.count === 0) {
              bindings.delete(lease.session);
              binding.close();
            }
          } finally {
            lease.release();
          }
        },
      };
    },
  };
}
