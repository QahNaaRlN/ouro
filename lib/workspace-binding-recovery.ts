import {constants} from 'node:fs';
import {open,lstat,realpath,type FileHandle} from 'node:fs/promises';
import path from 'node:path';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {isWellFormedUnicode} from '../packages/core/src/unicode';
import {assertWorkspaceFolder,resolveWorkspaceFolder,type WorkspaceBinding,type WorkspaceIdentity} from './workspace-files';

import type { BindingRecoveryRuntime, BindingRuntimePlatform, BindingRecoveryStatus } from '@ouro/protocol/http';
export type { BindingRecoveryRuntime } from '@ouro/protocol/http';
/** Компиляция отклоняет изменение pure platform union относительно установленного Node API. */
type AssertExactPlatform<T extends true> = T;
type PlatformMatchesNode = AssertExactPlatform<[BindingRuntimePlatform] extends [NodeJS.Platform] ? [NodeJS.Platform] extends [BindingRuntimePlatform] ? true : false : false>;
export type BindingRecoveryContext={actorId:string;projectId:string;binding:WorkspaceBinding};
export type BindingRecoveryVerificationInput=BindingRecoveryContext&{ticket:string};
/** Фиксирует наблюдение сохранённой привязки, доступность её восстановления и сопутствующие данные runtime. */
export type BindingRecoveryInspection={
 status:BindingRecoveryStatus;eligible:boolean;savedBinding:WorkspaceBinding;observedBinding?:WorkspaceBinding;
 runtime:BindingRecoveryRuntime;reason:string;origin:'unknown';ticket?:string;expiresAt?:string;
};
export type VerifiedBindingRecovery={savedBinding:WorkspaceBinding;observedBinding:WorkspaceBinding;runtime:BindingRecoveryRuntime;issuedAt:string;expiresAt:string;origin:'unknown'};
export type WorkspaceBindingRecoveryOptions={
 secret?:Uint8Array;now?:()=>number;ttlMs?:number;
 /** Trusted server/test seams. These values are never accepted from an HTTP payload. */
 runtime?:BindingRecoveryRuntime;probe?:(binding:WorkspaceBinding)=>Promise<WorkspaceBinding>;
};
export class WorkspaceBindingRecoveryError extends Error{
 constructor(public code:string,message:string){super(message);this.name='WorkspaceBindingRecoveryError';}
}
function fail(code:string,message:string):never{throw new WorkspaceBindingRecoveryError(code,message);}
const text=(max:number)=>z.string().min(1).max(max).refine(value=>isWellFormedUnicode(value)&&value.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(value));
const identitySchema=z.strictObject({dev:z.string().regex(/^(?:0|[1-9]\d*)$/),ino:z.string().regex(/^(?:0|[1-9]\d*)$/)});
const bindingSchema=z.strictObject({id:text(200),canonicalPath:text(4096),identity:identitySchema});
const runtimeSchema=z.strictObject({platform:text(100),node:text(100),uv:text(100),architecture:text(100)});
const contextSchema=z.strictObject({actorId:text(200),projectId:text(200),binding:bindingSchema});
const inputSchema=z.strictObject({requestId:text(200).refine(value=>value.length>=8),ticket:text(65536),reason:text(2000),acknowledgeUnknownContinuity:z.literal(true)});
export type WorkspaceBindingRecoveryInput=z.infer<typeof inputSchema>;
export function parseRecoveryInput(body:unknown):WorkspaceBindingRecoveryInput{
 const parsed=inputSchema.safeParse(body);if(!parsed.success)fail('VALIDATION_ERROR','Нужны исходный requestId, выданный билет, основание и явное подтверждение неизвестного происхождения старой привязки.');return parsed.data;
}
const sameIdentity=(left:WorkspaceIdentity,right:WorkspaceIdentity)=>left.dev===right.dev&&left.ino===right.ino;
const sameBinding=(left:WorkspaceBinding,right:WorkspaceBinding)=>left.id===right.id&&left.canonicalPath===right.canonicalPath&&sameIdentity(left.identity,right.identity);
const sameRuntime=(left:BindingRecoveryRuntime,right:BindingRecoveryRuntime)=>left.platform===right.platform&&left.node===right.node&&left.uv===right.uv&&left.architecture===right.architecture;
const positiveIdentity=(identity:WorkspaceIdentity)=>identitySchema.safeParse(identity).success&&identity.dev!=='0'&&identity.ino!=='0';
const copyBinding=(binding:WorkspaceBinding):WorkspaceBinding=>({...binding,identity:{...binding.identity}});
const statIdentity=(stat:{dev:bigint;ino:bigint}):WorkspaceIdentity=>({dev:stat.dev.toString(),ino:stat.ino.toString()});
function conflict():never{return fail('WORKSPACE_BINDING_CONFLICT','Путь, тип или идентичность папки изменились; новая доверенная привязка не установлена.');}

type OpenedDirectory={handle:FileHandle;absolutePath:string;identity:WorkspaceIdentity};
const anchor=(entry:OpenedDirectory)=>process.platform==='linux'?`/proc/self/fd/${entry.handle.fd}`:entry.absolutePath;
async function validateOpened(entry:OpenedDirectory){
 const [opened,named,canonical]=await Promise.all([entry.handle.stat({bigint:true}),lstat(entry.absolutePath,{bigint:true}),realpath(anchor(entry))]);
 if(!opened.isDirectory()||!named.isDirectory()||named.isSymbolicLink()||canonical!==entry.absolutePath||!sameIdentity(statIdentity(opened),entry.identity)||!sameIdentity(statIdentity(named),entry.identity))conflict();
}

/** Observe a named directory through live descriptors, without adopting the saved device value. */
export async function probeWorkspaceBinding(binding:WorkspaceBinding):Promise<WorkspaceBinding>{
 if(!bindingSchema.safeParse(binding).success||!path.isAbsolute(binding.canonicalPath)||path.resolve(binding.canonicalPath)!==binding.canonicalPath)conflict();
 const original=await lstat(binding.canonicalPath,{bigint:true});if(!original.isDirectory()||original.isSymbolicLink())conflict();
 // Reuse the existing protected-folder policy; aliases cannot become a recovery target.
 const resolved=await resolveWorkspaceFolder(binding.canonicalPath);if(resolved.canonicalPath!==binding.canonicalPath||!sameIdentity(resolved.identity,statIdentity(original)))conflict();
 const root=path.parse(binding.canonicalPath).root,parts=binding.canonicalPath.slice(root.length).split(path.sep).filter(Boolean),opened:OpenedDirectory[]=[];
 const flags=constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0);
 try{
  let absolutePath=root;
  for(let index=-1;index<parts.length;index++){
   const parent=opened.at(-1),namedPath=index<0?root:path.join(parent?anchor(parent):absolutePath,parts[index]);
   if(index>=0)absolutePath=path.join(absolutePath,parts[index]);
   const named=await lstat(namedPath,{bigint:true});if(!named.isDirectory()||named.isSymbolicLink())conflict();
   const handle=await open(namedPath,flags),entry={handle,absolutePath,identity:statIdentity(named)};opened.push(entry);
   const actual=await handle.stat({bigint:true});if(!actual.isDirectory()||!sameIdentity(statIdentity(actual),entry.identity))conflict();
   await validateOpened(entry);
  }
  for(const entry of opened)await validateOpened(entry);
  const last=opened.at(-1)!;if(!sameIdentity(last.identity,statIdentity(original)))conflict();
  const observed={...copyBinding(binding),identity:{...last.identity}};await assertWorkspaceFolder(observed);
  return observed;
 }finally{await Promise.allSettled(opened.reverse().map(entry=>entry.handle.close()));}
}

const ticketSchema=z.strictObject({version:z.literal(1),purpose:z.literal('workspace-binding-recovery'),actorId:text(200),projectId:text(200),savedBinding:bindingSchema,observedBinding:bindingSchema,runtime:runtimeSchema,issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),origin:z.literal('unknown')});
const maxTtlMs=5*60*1000;
/** One instance/key per StoreOwner; inspection issues a stateless ticket and performs no writes. */
export function createWorkspaceBindingRecovery(options:WorkspaceBindingRecoveryOptions={}){
 const secret=Buffer.from(options.secret??randomBytes(32)),now=options.now??Date.now,ttlMs=options.ttlMs??maxTtlMs;
 if(secret.length<32||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>maxTtlMs)fail('VALIDATION_ERROR','Недопустимые параметры сервиса восстановления привязки.');
 const runtime:BindingRecoveryRuntime={...(options.runtime??{platform:process.platform,node:process.version,uv:process.versions.uv,architecture:process.arch})};
 if(!runtimeSchema.safeParse(runtime).success)fail('VALIDATION_ERROR','Нет достоверного описания серверного окружения.');
 const probe=options.probe??probeWorkspaceBinding;
 const signature=(encoded:string)=>createHmac('sha256',secret).update(encoded).digest();
 const candidate=(saved:WorkspaceBinding,observed:WorkspaceBinding)=>runtime.platform==='win32'&&saved.identity.dev==='0'&&saved.identity.ino!=='0'&&positiveIdentity(observed.identity)&&saved.id===observed.id&&saved.canonicalPath===observed.canonicalPath&&saved.identity.ino===observed.identity.ino;
 const inspect=async(input:BindingRecoveryContext):Promise<BindingRecoveryInspection>=>{
  if(!contextSchema.safeParse(input).success)fail('VALIDATION_ERROR','Нужны точный проект, автор и сохранённая привязка.');
  const saved=copyBinding(input.binding),base={savedBinding:saved,runtime:{...runtime},origin:'unknown' as const};
  let observed:WorkspaceBinding;
  try{observed=copyBinding(await probe(saved));if(!bindingSchema.safeParse(observed).success||!positiveIdentity(observed.identity))return {...base,status:'unavailable',eligible:false,reason:'Окружение не предоставило полную ненулевую идентичность папки.'};}
  catch(error){return {...base,status:(error as {code?:string}).code==='WORKSPACE_BINDING_CONFLICT'?'conflict':'unavailable',eligible:false,reason:'Папка недоступна для согласованного чтения lstat/fstat/realpath либо путь изменился.'};}
  if(sameBinding(saved,observed))return {...base,observedBinding:observed,status:'healthy',eligible:false,reason:'Текущая идентичность точно совпадает с сохранённой привязкой.'};
  if(!candidate(saved,observed))return {...base,observedBinding:observed,status:'conflict',eligible:false,reason:'Это не ограниченный Windows-случай старого dev=0 с тем же точным путём и inode. Автоматическая замена запрещена.'};
  const issuedAt=new Date(now()).toISOString(),expiresAt=new Date(Date.parse(issuedAt)+ttlMs).toISOString();
  const payload={version:1,purpose:'workspace-binding-recovery',actorId:input.actorId,projectId:input.projectId,savedBinding:saved,observedBinding:observed,runtime,issuedAt,expiresAt,origin:'unknown'},encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {...base,observedBinding:observed,status:'candidate',eligible:true,reason:'Причина старого dev=0 неизвестна. Только владелец может явно установить новую текущую доверенную привязку; совпадение пути и inode не доказывает непрерывность папки.',ticket:encoded+'.'+signature(encoded).toString('base64url'),expiresAt};
 };
 const verify=async(input:BindingRecoveryVerificationInput):Promise<VerifiedBindingRecovery>=>{
  if(!input||typeof input.ticket!=='string'||input.ticket.length>65536)fail('BINDING_RECOVERY_TICKET_INVALID','Билет восстановления недействителен.');
  const pieces=input.ticket.split('.');if(pieces.length!==2||!pieces.every(piece=>/^[A-Za-z0-9_-]+$/.test(piece)))fail('BINDING_RECOVERY_TICKET_INVALID','Билет восстановления недействителен.');
  const [encoded,provided]=pieces,received=Buffer.from(provided,'base64url'),expected=signature(encoded);
  if(received.length!==expected.length||received.toString('base64url')!==provided||!timingSafeEqual(received,expected))fail('BINDING_RECOVERY_TICKET_INVALID','Подпись билета восстановления не подтверждена.');
  let decoded:unknown;try{const bytes=Buffer.from(encoded,'base64url');if(bytes.toString('base64url')!==encoded)throw new Error();decoded=JSON.parse(bytes.toString('utf8'));}catch{fail('BINDING_RECOVERY_TICKET_INVALID','Билет восстановления повреждён.');}
  const parsed=ticketSchema.safeParse(decoded);if(!parsed.success)fail('BINDING_RECOVERY_TICKET_INVALID','Билет восстановления не соответствует контракту.');
  const ticket=parsed.data,issued=Date.parse(ticket.issuedAt),expires=Date.parse(ticket.expiresAt),current=now();
  if(current>=expires)fail('BINDING_RECOVERY_TICKET_EXPIRED','Срок билета истёк. Снова проверьте папку перед подтверждением.');
  if(!contextSchema.safeParse({actorId:input.actorId,projectId:input.projectId,binding:input.binding}).success||issued>current||expires<=issued||expires-issued>maxTtlMs||ticket.actorId!==input.actorId||ticket.projectId!==input.projectId||!sameBinding(ticket.savedBinding,input.binding)||!sameRuntime(ticket.runtime as BindingRecoveryRuntime,runtime)||!candidate(ticket.savedBinding,ticket.observedBinding))fail('BINDING_RECOVERY_TICKET_INVALID','Билет выдан другому автору, проекту, привязке или серверному окружению.');
  let observed:WorkspaceBinding;try{observed=await probe(copyBinding(input.binding));}catch{conflict();}
  if(!sameBinding(observed,ticket.observedBinding)||!candidate(ticket.savedBinding,observed))conflict();
  if(now()>=expires)fail('BINDING_RECOVERY_TICKET_EXPIRED','Срок билета истёк во время проверки папки. Снова проверьте папку перед подтверждением.');
  return {savedBinding:copyBinding(ticket.savedBinding),observedBinding:copyBinding(observed),runtime:{...runtime},issuedAt:ticket.issuedAt,expiresAt:ticket.expiresAt,origin:'unknown'};
 };
 return {inspect,verify};
}
export type WorkspaceBindingRecovery=ReturnType<typeof createWorkspaceBindingRecovery>;
