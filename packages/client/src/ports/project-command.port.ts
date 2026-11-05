import type {
  ClientOperationOptions,
  FrozenProjectCommandIntent,
  ProjectCommandOutcome,
} from './project.types';

/** Порт, который отправляет исходное намерение без смены идентичности и тела при повторе. */
export interface ProjectCommandPort {
  execute(
    intent: FrozenProjectCommandIntent,
    options?: ClientOperationOptions,
  ): Promise<ProjectCommandOutcome>;
}
