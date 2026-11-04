import type {ProjectMetadata} from '@ouro/protocol/http';
import type {ClientIdentityDTO,ClientOperationOptions,WorkspaceProjectDTO} from './project.types';

/** Отображаемая сессия без account payload и credential. */
export type IdentitySessionDTO=ClientIdentityDTO&Readonly<{hasAccount:boolean}>;
/** Исходный владелец чтения и поколение доступа; сам scope не предоставляет полномочий. */
export type CatalogReadScope=Readonly<{ownerId:string;sourceId:string;actorId:string|null;projectId:string|null;accessEpoch:number;hostEpoch?:number}>;
/** Конечный набор поддерживаемых чтений identity и каталога. */
export type CatalogReadCapability='read-identity-session'|'list-workspace-projects'|'list-account-projects';
/** Подтверждённое чтение либо явно недоступная операция хоста. */
export type CatalogReadResult<T>=Readonly<{status:'available';value:T}>|Readonly<{status:'unsupported';capability:CatalogReadCapability}>;
/** Порт трёх смысловых чтений без HTTP, UI и произвольного адреса запроса. */
export interface CatalogReadPort{
 readIdentitySession(scope:CatalogReadScope,options?:ClientOperationOptions):Promise<CatalogReadResult<IdentitySessionDTO>>;
 listWorkspaceProjects(scope:CatalogReadScope,options?:ClientOperationOptions):Promise<CatalogReadResult<readonly WorkspaceProjectDTO[]>>;
 listAccountProjects(scope:CatalogReadScope,options?:ClientOperationOptions):Promise<CatalogReadResult<readonly ProjectMetadata[]>>;
}
