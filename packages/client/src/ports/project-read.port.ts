import type {
  ClientOperationOptions,
  ClientPortResult,
  ProjectClientScope,
  ProjectSnapshotDTO,
  WorkspaceSnapshotDTO,
} from './project.types';

/** Порт, который читает существующие представления проекта в исходном контексте доступа. */
export interface ProjectReadPort {
  readSnapshot(
    scope: ProjectClientScope,
    options?: ClientOperationOptions,
  ): Promise<ClientPortResult<ProjectSnapshotDTO>>;
  readWorkspace(
    scope: ProjectClientScope,
    options?: ClientOperationOptions,
  ): Promise<ClientPortResult<WorkspaceSnapshotDTO>>;
}
