import type { Actor, DomainEvent, ProjectState } from '../../../core/src/types';

/** Тип, описывающий исходный проект и поколение доступа клиентской операции. */
export type ProjectClientScope = Readonly<{
  projectId: string;
  actorId: string;
  accessEpoch: number;
  hostEpoch?: number;
}>;

/** Тип, описывающий подтверждённое серверное представление истории проекта. */
export type ProjectSnapshotDTO = Readonly<{ state: ProjectState; cursor: number; storage?: string }>;

/** Тип, описывающий доступную пользователю папку или hosted-проект Ouro. */
export type WorkspaceProjectDTO = Readonly<{
  id: string;
  name: string;
  rootPath: string | null;
  kind: 'folder' | 'demo' | 'hosted';
  createdAt: string;
  createdBy: string | null;
  bindingId?: string | null;
  rootIdentity?: unknown;
  role?: 'Owner' | 'Contributor' | 'Viewer';
}>;

/** Тип, описывающий регистрацию агента без выдаваемого ему секретного ключа. */
export type AgentRegistrationDTO = Readonly<{
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}>;

/** Тип, описывающий публичные параметры подключения агента к проекту. */
export type WorkspaceConnectionDTO = Readonly<{
  httpUrl: string;
  stdioCommand: string;
  stdioArgs: readonly string[];
  projectId: string;
  localBridgeRequired?: boolean;
}>;

/** Тип, описывающий существующий полный ответ чтения рабочего проекта. */
export type WorkspaceSnapshotDTO = ProjectSnapshotDTO & Readonly<{
  project: WorkspaceProjectDTO;
  agents: readonly AgentRegistrationDTO[];
  connection: WorkspaceConnectionDTO;
}>;

/** Тип, описывающий существующую квитанцию атомарной проектной команды. */
export type ProjectCommandReceiptDTO = ProjectSnapshotDTO & Readonly<{
  events: readonly DomainEvent[];
  replayed: boolean;
}>;

/** Тип, описывающий отображаемую идентичность без сессионного credential. */
export type ClientIdentityDTO = Readonly<{ actor: Actor | null; canManageParticipants: boolean }>;

/** Тип, описывающий объявленную возможность адаптера без предоставления полномочий. */
export type ProjectClientCapability = 'read-snapshot' | 'read-workspace' | 'execute-command' | 'start-project-work' | 'subscribe-project';

/** Тип, описывающий набор явно поддержанных адаптером операций. */
export type ProjectClientCapabilities = Readonly<Record<ProjectClientCapability, boolean>>;

/** Тип, описывающий поддержанный результат либо явно недоступную возможность. */
export type ClientPortResult<T> = Readonly<{ status: 'available'; value: T }> | Readonly<{
  status: 'unsupported';
  capability: ProjectClientCapability;
}>;

/** Тип, описывающий отмену ожидания без зависимости от DOM-событий. */
export interface ClientCancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Тип, описывающий управление ожиданием чтения или транспортной операции. */
export type ClientOperationOptions = Readonly<{ signal?: ClientCancellationSignal }>;

/** Тип, описывающий семантическую операцию существующего проектного HTTP-контракта. */
export type ProjectCommandOperation = 'execute-command' | 'start-project-work';

/** Тип, описывающий неизменяемое исходное намерение до первой отправки. */
export type FrozenProjectCommandIntent = Readonly<{
  operation: ProjectCommandOperation;
  scope: ProjectClientScope;
  requestId: string;
  expectedVersion: number;
  body: string;
}>;

/** Тип, описывающий исход записи отдельно от транспортной диагностики. */
export type ProjectCommandOutcome = Readonly<{
  status: 'confirmed';
  receipt: ProjectCommandReceiptDTO;
}> | Readonly<{
  status: 'rejected';
  code: string;
  message: string;
  httpStatus?: number;
}> | Readonly<{
  status: 'unknown';
  reason: 'transport' | 'response-contract' | 'unconfirmed';
}> | Readonly<{
  status: 'unsupported';
  capability: ProjectCommandOperation;
}>;

/** Тип, описывающий состояние подписки после прикладной проверки снимка. */
export type ProjectConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'reload-required';
