import type { FrozenProjectCommandIntent, ProjectClientScope } from '../ports';
import type { WorkspaceIntent } from './workspace-intents';
import type { ProjectCommandPresentation } from '../lifecycle/project-command-presentation.types';

/** Тип, описывающий допуск явной отправки без изменения сохранённых намерений. */
export type ProjectCommandDispatchPlan = { allowed: boolean; rejected: readonly WorkspaceIntent[] };

/** Утилита допуска явной отправки: точный повтор сохраняет RAM, новая операция может закрыть только доказанные отказы. */
export function planProjectCommandDispatch(
  scope: ProjectClientScope | undefined,
  intent: FrozenProjectCommandIntent,
  pending: readonly WorkspaceIntent[],
  presentation?: ProjectCommandPresentation,
): ProjectCommandDispatchPlan {
  if (
    !scope ||
    scope.projectId !== intent.scope.projectId ||
    scope.actorId !== intent.scope.actorId ||
    scope.accessEpoch !== intent.scope.accessEpoch ||
    scope.hostEpoch !== intent.scope.hostEpoch
  )
    return { allowed: false, rejected: [] };
  const scoped = pending.filter(
      (value) => value.projectId === scope.projectId && value.actorId === scope.actorId,
    ),
    original = scoped.find((value) => value.requestId === intent.requestId);
  const base = '/api/projects/' + encodeURIComponent(scope.projectId),
    allowedUrls =
      intent.operation === 'start-project-work'
        ? [base + '/tasks']
        : ['/api/commands', base + '/commands'];
  if (
    original &&
    (original.body !== intent.body ||
      original.expectedVersion !== intent.expectedVersion ||
      !allowedUrls.includes(original.url) ||
      (presentation &&
        (original.key !== `${scope.actorId}:${scope.projectId}:${presentation.slot}` ||
          original.label !== presentation.label)))
  )
    return { allowed: false, rejected: [] };
  const unresolved = scoped.filter((value) => value.status !== 'rejected' || value.uncertain);
  const blockedByAnotherIntent =
    unresolved.length > 0 && (!original || !unresolved.includes(original));
  if (unresolved.some((value) => value.status === 'sending') || blockedByAnotherIntent)
    return { allowed: false, rejected: [] };
  return {
    allowed: true,
    rejected: original
      ? []
      : scoped.filter((value) => value.status === 'rejected' && !value.uncertain),
  };
}
