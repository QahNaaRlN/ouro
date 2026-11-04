/** Публичный API переносимых клиентских портов Ouro; подключение runtime выполняется в P1.2. */

/** api */
export { freezeProjectCommandIntent, InvalidProjectCommandIntentError } from './freeze-project-command-intent';

/** types */
export type { ProjectReadPort } from './project-read.port';
export type { ProjectCommandPort } from './project-command.port';
export type { ProjectSnapshotObserver, ProjectSubscription, ProjectSubscriptionPort } from './project-subscription.port';
export type { AgentRegistrationDTO, ClientCancellationSignal, ClientIdentityDTO, ClientOperationOptions, ClientPortResult, FrozenProjectCommandIntent, ProjectClientCapabilities, ProjectClientCapability, ProjectClientScope, ProjectCommandOperation, ProjectCommandOutcome, ProjectCommandReceiptDTO, ProjectConnectionStatus, ProjectSnapshotDTO, WorkspaceConnectionDTO, WorkspaceProjectDTO, WorkspaceSnapshotDTO } from './project.types';
