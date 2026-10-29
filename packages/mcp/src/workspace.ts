import path from 'node:path';
import {DomainError} from '../../core/src';
import {listWorkspaceFiles,readWorkspaceFile,type WorkspaceBinding} from '../../../lib/workspace-files';
import type {AgentWorkspace} from './agent-service';

export type WorkspaceMetadataStore={
 projectId:string;
 getWorkspaceProject(id:string):Promise<{id:string;name:string;rootPath:string|null;bindingId:string|null}|null>;
 getWorkspaceBinding():Promise<WorkspaceBinding|null>;
};

/** Server-owned adapter: paths and folder identity never come from tool input. */
export function createAgentWorkspace(store:WorkspaceMetadataStore):AgentWorkspace{
 const binding=async()=>{
  const found=await store.getWorkspaceBinding();
  if(!found)throw new DomainError('NOT_AVAILABLE','У проекта нет привязанной папки для чтения файлов.');
  return found;
 };
 return {
  async getMetadata(){
   const project=await store.getWorkspaceProject(store.projectId);
   if(!project?.rootPath||!project.bindingId)return null;
   if(project.id!==store.projectId)throw new DomainError('FORBIDDEN','Привязка папки относится к другому проекту.');
   return {name:project.name,projectId:project.id,bindingId:project.bindingId,folderName:path.basename(project.rootPath),capabilities:{readOnlyFiles:true}};
  },
  async listFiles(relativePath,cursor){return listWorkspaceFiles(await binding(),relativePath,cursor);},
  async readFile(relativePath){return readWorkspaceFile(await binding(),relativePath);},
 };
}
