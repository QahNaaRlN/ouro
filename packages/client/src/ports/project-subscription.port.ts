import type { ProjectClientScope, ProjectConnectionStatus, ProjectSnapshotDTO } from './project.types';

/** Тип, описывающий синхронное принятие снимка и состояние проектного соединения. */
export interface ProjectSnapshotObserver {
  onSnapshot(snapshot: ProjectSnapshotDTO): void;
  onStatus(status: ProjectConnectionStatus, reason?: string): void;
}

/** Тип, описывающий явное завершение и восстановление одной подписки. */
export interface ProjectSubscription {
  close(): void;
  reconnect(): void;
}

/** Порт, который подписывается на подтверждённую историю одного проекта. */
export interface ProjectSubscriptionPort {
  subscribe(scope: ProjectClientScope, afterCursor: number, observer: ProjectSnapshotObserver): ProjectSubscription;
}
