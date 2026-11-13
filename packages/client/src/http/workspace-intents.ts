import type { ProjectState } from '../../../core/src/types';
import type {
  AgentRegistrationDTO as AgentRegistration,
  ClientCancellationSignal,
} from '../ports/project.types';
import { isWellFormedUnicode } from '@ouro/protocol';
import {
  isWorkspaceBindingRejection,
  verifyWorkspaceCommandReceipt,
  isWorkspaceRecoveryTicketRejection,
} from './workspace-intent-proof';

/** Доступный проект каталога с подтверждённой ролью и привязкой к корню. */
export type WorkspaceProject = {
  id: string;
  name: string;
  rootPath: string | null;
  kind: 'folder' | 'demo' | 'hosted';
  createdAt: string;
  createdBy: string | null;
  bindingId?: string | null;
  rootIdentity?: unknown;
  role?: 'Owner' | 'Contributor' | 'Viewer';
};
/** Параметры подключения клиента к конкретному проекту рабочего места. */
export type WorkspaceConnection = {
  httpUrl: string;
  stdioCommand: string;
  stdioArgs: string[];
  projectId: string;
  localBridgeRequired?: boolean;
};
/** Согласованное представление проекта, истории, агентов и подключения. */
export type WorkspaceSnapshot = {
  project: WorkspaceProject;
  state: ProjectState;
  cursor: number;
  agents: AgentRegistration[];
  connection: WorkspaceConnection;
};
/** Исходные RAM-байты действия и состояние доказательства его исхода. */
export type WorkspaceIntent = {
  key: string;
  projectId: string | null;
  url: string;
  actorId: string;
  body: string;
  requestId: string;
  expectedVersion?: number;
  label: string;
  status: 'sending' | 'unknown' | 'rejected';
  message: string;
  errorCode?: string;
  httpStatus?: number;
  uncertain?: boolean;
  rejection?: 'workspace-binding';
  copyUnverified?: true;
};
type WireError = { error?: { code?: string; message?: string } };
/** Явный исход admission текущего owner; не является сетевой квитанцией или ошибкой команды. */
export type WorkspaceReceiptAdmission = 'admitted' | 'inactive';
const pending = new Map<string, WorkspaceIntent>(),
  listeners = new Set<() => void>();
let pendingVersion = 0;
function notify() {
  pendingVersion++;
  listeners.forEach((listener) => listener());
}
/** Наблюдает изменения RAM-реестра и возвращает освобождение подписки. */
export function subscribeWorkspaceIntents(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const provenRejections = new Set([
  'VERSION_CONFLICT',
  'REVISION_CONFLICT',
  'INVALID_TRANSITION',
  'VALIDATION_ERROR',
  'DECISION_ALREADY_RESOLVED',
  'IDEMPOTENCY_CONFLICT',
  'REQUEST_ID_CONFLICT',
  'DEPENDENCY_CYCLE',
  'PENDING_LIMIT_EXCEEDED',
  'CORRECTION_REQUIRES_REVISION',
  'VERIFICATION_INPUT_UNAVAILABLE',
  'RUNNER_ERROR',
]);
function sameFrozenIntent(
  current: WorkspaceIntent | undefined,
  intent: WorkspaceIntent,
): current is WorkspaceIntent {
  return (
    !!current &&
    current.key === intent.key &&
    current.body === intent.body &&
    current.url === intent.url &&
    current.actorId === intent.actorId &&
    current.projectId === intent.projectId &&
    current.requestId === intent.requestId
  );
}

/** Читает JSON с cookie авторизацией и отменой, сохраняя HTTP status и код отказа. */
export async function readWorkspaceJSON<T>(
  url: string,
  signal?: ClientCancellationSignal,
): Promise<T> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) abort();
  try {
    const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      }),
      body = (await response.json()) as T & WireError;
    if (!response.ok)
      throw Object.assign(
        new Error(
          typeof body?.error?.message === 'string'
            ? body.error.message
            : 'Не удалось прочитать рабочее место.',
        ),
        { status: response.status, code: body?.error?.code },
      );
    return body;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
/** Фиксирует точные байты, автора и requestId нового действия до первой отправки. */
export function freezeWorkspaceIntent(input: {
  projectId: string | null;
  url: string;
  actorId: string;
  label: string;
  slot: string;
  body: Record<string, unknown>;
}): WorkspaceIntent {
  const requestId =
    typeof input.body.requestId === 'string' ? input.body.requestId : crypto.randomUUID();
  return {
    key: `${input.actorId}:${input.projectId ?? 'catalog'}:${input.slot}`,
    projectId: input.projectId,
    url: input.url,
    actorId: input.actorId,
    label: input.label,
    requestId,
    expectedVersion:
      typeof input.body.expectedVersion === 'number' ? input.body.expectedVersion : undefined,
    body: JSON.stringify({ ...input.body, requestId }),
    status: 'sending',
    message: '',
  };
}
/** Утилита локального рассмотрения копии, которая не доказывает исходные сетевые байты. */
export function reviewUnknownWorkspaceIntent(input: {
  copy: string;
  projectId: string;
  actorId: string;
}): WorkspaceIntent {
  if (typeof input.copy !== 'string' || !input.copy.length || input.copy.length > 64000)
    throw new Error('Вставьте копию JSON размером не более 64 000 символов.');
  const value = JSON.parse(input.copy) as {
    projectId?: unknown;
    actorId?: unknown;
    request?: unknown;
  };
  if (!value || value.projectId !== input.projectId || value.actorId !== input.actorId)
    throw new Error(
      'Проект и автор копии должны точно совпадать с открытым проектом и текущим участником.',
    );
  const request = value.request as Record<string, unknown>,
    id = (item: unknown, min = 1): item is string =>
      typeof item === 'string' &&
      item.length >= min &&
      item.length <= 200 &&
      isWellFormedUnicode(item) &&
      !/[\u0000-\u001f\u007f]/.test(item);
  if (!id(input.projectId) || !id(input.actorId))
    throw new Error('Для восстановления нужны текущий проект и исходный участник.');
  const fields = [
    'type',
    'specId',
    'specRevisionId',
    'agentId',
    'requestId',
    'expectedVersion',
    'flowTracking',
    'retryOfExecutionId',
  ];
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    request.type !== 'startExecution' ||
    Object.keys(request).some((key) => !fields.includes(key)) ||
    !id(request.specId) ||
    !id(request.specRevisionId) ||
    !id(request.agentId) ||
    !id(request.requestId, 8) ||
    typeof request.expectedVersion !== 'number' ||
    !Number.isSafeInteger(request.expectedVersion) ||
    request.expectedVersion < 0 ||
    ('flowTracking' in request && request.flowTracking !== 'enforced') ||
    ('retryOfExecutionId' in request && !id(request.retryOfExecutionId))
  )
    throw new Error(
      'Нужна исходная команда startExecution с точными ID, requestId и версией. Неизвестные поля и другие команды не поддерживаются.',
    );
  return {
    key: `${input.actorId}:${input.projectId}:restored-start:${request.requestId}`,
    projectId: input.projectId,
    actorId: input.actorId,
    url: '/api/projects/' + encodeURIComponent(input.projectId) + '/commands',
    body: JSON.stringify(request),
    requestId: request.requestId,
    expectedVersion: request.expectedVersion,
    label: 'Исходное назначение из копии',
    status: 'unknown',
    uncertain: true,
    copyUnverified: true,
    message:
      'Запрос сохранён из копии. Точность исторических байтов не подтверждена; исход остаётся UNKNOWN.',
  };
}
/** Утилита, которая сохраняет рассмотренную владельцем копию в памяти без отправки или замены намерения. */
export function restoreUnknownWorkspaceIntent(input: {
  copy: string;
  projectId: string;
  actorId: string;
  acknowledgeUnverifiedCopy: boolean;
}): WorkspaceIntent {
  if (input.acknowledgeUnverifiedCopy !== true)
    throw new Error(
      'Сначала рассмотрите копию и подтвердите, что её историческая точность не установлена.',
    );
  const intent = reviewUnknownWorkspaceIntent(input);
  const existing =
    [...pending.values()].find((item) => item.requestId === intent.requestId) ||
    pending.get(intent.key);
  if (existing) {
    if (
      existing.requestId !== intent.requestId ||
      existing.projectId !== intent.projectId ||
      existing.actorId !== intent.actorId ||
      existing.url !== intent.url ||
      existing.body !== intent.body
    )
      throw new Error(
        'Этот requestId уже сохранён с другим телом, адресом, автором или проектом. Исходный запрос оставлен без изменений.',
      );
    return existing;
  }
  pending.set(intent.key, intent);
  notify();
  return intent;
}
/** Отправляет исходные байты; удаляет намерение только при доказанной и принятой текущим owner квитанции. */
export async function sendWorkspaceIntent<T = unknown>(
  intent: WorkspaceIntent,
  onReceipt?: (value: unknown) => WorkspaceReceiptAdmission | void,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<{ ok: true; data: T } | { ok: false }> {
  const existing = pending.get(intent.key);
  if (existing && !sameFrozenIntent(existing, intent))
    throw new Error('Сначала восстановите исходное действие.');
  const wasUncertain = !!(
    existing?.uncertain ||
    intent.uncertain ||
    existing?.status === 'unknown' ||
    existing?.status === 'sending' ||
    intent.status === 'unknown'
  );
  const dispatch: WorkspaceIntent = {
    ...(existing ?? intent),
    uncertain: wasUncertain,
    status: 'sending',
    message: '',
  };
  pending.set(intent.key, dispatch);
  notify();
  let responseStatus: number | undefined;
  try {
    const response = await fetcher(intent.url, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Ouro-Expected-Participant': intent.actorId,
        ...(intent.projectId
          ? {
              'X-Ouro-Expected-Project': intent.projectId,
              ...(intent.url === '/api/commands' ? { 'X-Ouro-Project-Id': intent.projectId } : {}),
            }
          : {}),
      },
      body: intent.body,
    });
    responseStatus = response.status;
    const body = (await response.json()) as T & WireError;
    const errorCode = typeof body?.error?.code === 'string' ? body.error.code : undefined,
      errorMessage = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    if (
      response.ok &&
      !response.redirected &&
      (await verifyWorkspaceCommandReceipt(intent, response, body))
    ) {
      if (pending.get(intent.key) !== dispatch) return { ok: false };
      const admission =
        body && typeof body === 'object' && 'state' in body ? onReceipt?.(body) : undefined;
      if (pending.get(intent.key) !== dispatch) return { ok: false };
      if (admission === 'inactive') {
        pending.set(intent.key, {
          ...dispatch,
          uncertain: true,
          status: 'unknown',
          httpStatus: response.status,
          message: 'Исходный контекст завершён. Результат сохранённого запроса не подтверждён.',
        });
        notify();
        return { ok: false };
      }
      pending.delete(intent.key);
      notify();
      return { ok: true, data: body };
    }
    const bindingRejected = await isWorkspaceBindingRejection(intent, response, body);
    const current = pending.get(intent.key);
    if (current !== dispatch) return { ok: false };
    const uncertain = !!(wasUncertain || current.uncertain || current.status === 'unknown');
    const rejected =
      !uncertain &&
      (bindingRejected ||
        isWorkspaceRecoveryTicketRejection(intent, response, body) ||
        (response.status >= 400 && response.status < 500 && provenRejections.has(errorCode ?? '')));
    pending.set(intent.key, {
      ...current,
      uncertain: uncertain || !rejected,
      status: rejected ? 'rejected' : 'unknown',
      errorCode,
      httpStatus: response.status,
      ...(bindingRejected ? { rejection: 'workspace-binding' as const } : {}),
      message: errorMessage ?? 'Сервер не подтвердил исход действия.',
    });
    notify();
    return { ok: false };
  } catch {
    const current = pending.get(intent.key);
    if (current === dispatch) {
      pending.set(intent.key, {
        ...current,
        uncertain: true,
        status: 'unknown',
        httpStatus: responseStatus,
        message: 'Ответ не получен. Действие могло сохраниться. Повторите тот же запрос.',
      });
      notify();
    }
    return { ok: false };
  }
}
/** Освобождает только тот же доказанно отклонённый слот, никогда не удаляя UNKNOWN. */
export function forgetRejectedWorkspaceIntent(intent: WorkspaceIntent) {
  const current = pending.get(intent.key);
  if (sameFrozenIntent(current, intent) && current.status === 'rejected' && !current.uncertain) {
    pending.delete(intent.key);
    notify();
  }
}

/** Утилита, которая читает поколение изменений RAM-реестра намерений. */
export const getWorkspaceIntentsVersion = () => pendingVersion;
/** Утилита, которая выбирает намерения только исходного проекта и автора. */
export const getWorkspaceIntents = (projectId: string | null, actorId: string | undefined) =>
  [...pending.values()].filter(
    (intent) => intent.projectId === projectId && intent.actorId === actorId,
  );
/** Утилита, которая сообщает о неподтверждённых намерениях до выгрузки страницы. */
export const hasPendingWorkspaceIntents = () => pending.size > 0;
