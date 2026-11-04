import type {WorkspaceIntent} from './workspace-intents';
import {createProjectSnapshotAdopter} from '../lifecycle/project-snapshot';
import {hasCommandReceiptHeader,verifiedCommandReceiptView} from './command-receipt-proof';

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
 return intent.url===base+'/commands'||intent.url==='/api/commands'?value:null;
}
export function isWorkspaceRecoveryTicketRejection(intent:WorkspaceIntent,response:Response,wire:unknown):boolean{
 if(!intent.projectId||intent.url!=='/api/projects/'+encodeURIComponent(intent.projectId)+'/binding-recovery'||response.status!==422||response.redirected)return false;
 if(!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return false;
 if(response.url){const url=new URL(response.url);if(typeof location==='undefined'||url.origin!==location.origin||url.pathname!==intent.url||url.search)return false;}
 const code=(wire as {error?:{code?:unknown}})?.error?.code;
 return code==='BINDING_RECOVERY_TICKET_INVALID'||code==='BINDING_RECOVERY_TICKET_EXPIRED';
}
/** Утилита, которая проверяет доказательство отказа точного авторизованного command guard. */
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
/**
 * Утилита, которая связывает квитанцию с исходным проектом, автором, requestId и версией.
 * @description Пустая или историческая партия без requestId не доказывает исход команды; UNKNOWN сохраняется.
 */
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
 const body=commandBody(intent);if(!body)return true;
 const projectId=intent.projectId;
 const receipt=wire as {state?:{projectId?:unknown;version?:unknown};events?:unknown;cursor?:unknown;replayed?:unknown};
 if(!receipt||!Array.isArray(receipt.events)||typeof receipt.replayed!=='boolean'||!projectId)return false;
 const receiptEvents:unknown[]=receipt.events;
 const expectedVersion=body.expectedVersion;
 if(body.requestId!==intent.requestId||typeof expectedVersion!=='number'||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion!==intent.expectedVersion||!receiptEvents.length)return false;
 const checked=createProjectSnapshotAdopter(projectId).adopt(wire);
 if(checked.status==='invalid')return false;
 const history=checked.snapshot.state.events;
 if(receiptEvents.length>history.length||checked.snapshot.cursor!==expectedVersion+receiptEvents.length)return false;
 const events=history.slice(history.length-receiptEvents.length);
 return events.every((event,index)=>event.projectId===projectId&&event.requestId===intent.requestId&&event.actor.id===intent.actorId&&event.actor.kind==='human'&&Array.isArray(event.actor.projectIds)&&event.actor.projectIds.includes(projectId)&&event.version===expectedVersion+index+1&&canonicalJSON(event)===canonicalJSON(receiptEvents[index]));
}

/** Дополняет прежний suffix guard только доказанным empty-receipt fallback; bad header всегда UNKNOWN. */
export async function verifyWorkspaceCommandReceipt(intent:WorkspaceIntent,response:Response,wire:unknown):Promise<boolean>{
 const command=commandBody(intent);if(!command||!hasCommandReceiptHeader(response))return isWorkspaceCommandReceipt(intent,wire);
 const verified=await verifiedCommandReceiptView(intent,response,wire,command);if(!verified)return false;
 return verified.events.length===0?verified.cursor===intent.expectedVersion:isWorkspaceCommandReceipt(intent,wire);
}
