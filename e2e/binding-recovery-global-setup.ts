import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import multiprojectGlobalSetup from './multiproject-global-setup';
import {createStore} from '../lib/store';
import {resolveWorkspaceFolder} from '../lib/workspace-files';
import {PROJECT_ID,type Actor} from '../packages/core/src';

export const bindingRecoveryFixturePath=path.resolve('artifacts/binding-recovery-browser-fixture.json');
export default async function bindingRecoveryGlobalSetup(){
 await multiprojectGlobalSetup();
 // This synthetic legacy record is created before the server first opens its
 // separate E2E database. No production switch or test-only HTTP hook exists.
 const dataDir=process.env.OURO_E2E_DATA_DIR;
 if(!dataDir||[3000,3220].includes(Number(process.env.OURO_E2E_PORT)))throw new Error('A separate binding E2E data directory and port are required.');
 const folder=await mkdtemp(path.join(tmpdir(),'ouro-binding-browser-')),resolved=await resolveWorkspaceFolder(folder),projectId=randomUUID(),bindingId=randomUUID();
 const owner=await createStore({dataDir,seedEvents:[]});
 try{
  const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]},human={...operator,projectIds:[projectId]};
  await owner.inspect('INSERT INTO ouro_projects(id,version) VALUES($1,0)',[projectId]);
  await owner.inspect("INSERT INTO ouro_workspace_projects(id,name,kind,root_path,binding_id,root_dev,root_ino,created_by) VALUES($1,'Isolated legacy Windows binding','folder',$2,$3,'0',$4,$5)",[projectId,resolved.canonicalPath,bindingId,resolved.identity.ino,operator.id]);
  const store=await owner.forProject(projectId),agent=await store.createAgent('Isolated recovery browser agent',human);
  const command=async(body:Record<string,unknown>)=>store.executeCommand({...body,requestId:randomUUID(),expectedVersion:(await store.getProject()).version},human);
  let result=await command({type:'createSpec',content:{title:'Restore an isolated assignment',goal:'Preserve the original request while a human re-establishes folder trust',dod:[{id:'one',text:'Exactly one assignment, no automatic acceptance',required:true}],constraints:'Synthetic fixture only',assumptions:'',risks:'',inputs:'',comment:''}});
  const spec=result.state.specs[0],revision=result.state.revisions[0];result=await command({type:'activateRevision',specId:spec.id,revisionId:revision.id});
  const fixture={projectId,specId:spec.id,revisionId:revision.id,agentId:agent.agent.id,folder,initialBinding:{id:bindingId,canonicalPath:resolved.canonicalPath,identity:{dev:'0',ino:resolved.identity.ino}},initialStateVersion:result.state.version,request:{type:'startExecution',specId:spec.id,specRevisionId:revision.id,agentId:agent.agent.id,expectedVersion:result.state.version,requestId:randomUUID()}};
  await mkdir(path.dirname(bindingRecoveryFixturePath),{recursive:true});await writeFile(bindingRecoveryFixturePath,JSON.stringify(fixture,null,2)+'\n');
 }finally{await owner.close();}
}
