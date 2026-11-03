import type {WorkspaceIntent} from './workspace-client';
import {createProjectSnapshotAdopter} from '@/lib/project-snapshot';

function canonicalJSON(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
function commandBody(intent:WorkspaceIntent):Record<string,unknown>|null{
 if(!intent.projectId)return null;
 const base='/api/projects/'+encodeURIComponent(intent.projectId),value=JSON.parse(intent.body);
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(intent.url===base+'/tasks')return {type:'startProjectWork',...value};
 return intent.url===base+'/commands'?value:null;
}
export function isWorkspaceRecoveryTicketRejection(intent:WorkspaceIntent,response:Response,wire:unknown):boolean{
 if(!intent.projectId||intent.url!=='/api/projects/'+encodeURIComponent(intent.projectId)+'/binding-recovery'||response.status!==422||response.redirected)return false;
 if(!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return false;
 if(response.url){const url=new URL(response.url);if(typeof location==='undefined'||url.origin!==location.origin||url.pathname!==intent.url||url.search)return false;}
 const code=(wire as {error?:{code?:unknown}})?.error?.code;
 return code==='BINDING_RECOVERY_TICKET_INVALID'||code==='BINDING_RECOVERY_TICKET_EXPIRED';
}
/** This marker is meaningful only for the exact authenticated command guard. */
export async function isWorkspaceBindingRejection(intent:WorkspaceIntent,response:Response,wire:unknown):Promise<boolean>{
 if(response.status!==409||response.redirected)return false;
 if(!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return false;
 if(response.url){const url=new URL(response.url);if(typeof location==='undefined'||url.origin!==location.origin||url.pathname!==intent.url||url.search)return false;}
 const error=(wire as {error?:{code?:unknown;details?:{commandRejection?:unknown}}})?.error;
 if(error?.code!=='WORKSPACE_BINDING_CONFLICT')return false;
 const proof=error.details?.commandRejection as Record<string,unknown>|undefined,body=commandBody(intent);
 if(!proof||!body||!['startProjectWork','startExecution','authorizeRemediation'].includes(String(body.type)))return false;
 if(proof.phase!=='workspace-binding-guard'||proof.outcome!=='rejected'||proof.receipt!=='absent'||proof.projectId!==intent.projectId||proof.actorId!==intent.actorId||proof.requestId!==intent.requestId||proof.commandType!==body.type)return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON(body)));
 return proof.bodySha256===Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function isWorkspaceCommandReceipt(intent:WorkspaceIntent,wire:unknown):boolean{
 if(intent.projectId&&intent.url==='/api/projects/'+encodeURIComponent(intent.projectId)+'/binding-recovery'){
  const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value),text=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
  const binding=(value:unknown):value is {id:string;canonicalPath:string;identity:{dev:string;ino:string}}=>record(value)&&text(value.id)&&text(value.canonicalPath)&&record(value.identity)&&text(value.identity.dev)&&text(value.identity.ino);
  if(!record(wire)||!record(wire.project)||!record(wire.recovery))return false;
  const {project,recovery}=wire,body=JSON.parse(intent.body),oldBinding=recovery.oldBinding,newBinding=recovery.newBinding;
  if(!binding(oldBinding)||!binding(newBinding)||!record(project.rootIdentity))return false;
  if(!record(recovery.runtime)||!['platform','node','uv','architecture'].every(key=>text((recovery.runtime as Record<string,unknown>)[key])))return false;
  if(!['issuedAt','expiresAt','createdAt'].every(key=>text(recovery[key])&&Number.isFinite(Date.parse(recovery[key] as string))))return false;
  return project.id===intent.projectId&&recovery.projectId===intent.projectId&&recovery.actorId===intent.actorId&&recovery.reason===body.reason&&recovery.acknowledgeUnknownContinuity===true&&recovery.origin==='unknown'&&text(recovery.recoveryId)&&typeof wire.replayed==='boolean'&&oldBinding.id!==newBinding.id&&oldBinding.canonicalPath===newBinding.canonicalPath&&oldBinding.identity.dev==='0'&&oldBinding.identity.ino===newBinding.identity.ino&&/^[1-9]\d*$/.test(newBinding.identity.dev)&&/^[1-9]\d*$/.test(newBinding.identity.ino)&&project.bindingId===newBinding.id&&project.rootPath===newBinding.canonicalPath&&project.rootIdentity.dev===newBinding.identity.dev&&project.rootIdentity.ino===newBinding.identity.ino;
 }
 if(!commandBody(intent))return true;
 const receipt=wire as {state?:{projectId?:unknown;version?:unknown};events?:unknown;cursor?:unknown;replayed?:unknown};
 if(!receipt||!Array.isArray(receipt.events)||typeof receipt.replayed!=='boolean'||!intent.projectId)return false;
 const checked=createProjectSnapshotAdopter(intent.projectId).adopt(wire);
 if(checked.status==='invalid')return false;
 const history=checked.snapshot.state.events,events=receipt.events;
 return events.length<=history.length&&events.every((event,index)=>canonicalJSON(event)===canonicalJSON(history[history.length-events.length+index]));
}
