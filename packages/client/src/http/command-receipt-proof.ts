import {z} from 'zod';
import {isWellFormedUnicode} from '@ouro/protocol';
import {canonicalCommandJSON} from '../../../../lib/command-canonical-json';
import {canonicalProjectJSON,commandReceiptProjection} from '../lifecycle/project-snapshot';
import type {WorkspaceIntent} from './workspace-intents';

const headerName='X-Ouro-Command-Receipt';
const identifier=z.string().min(1).max(200).refine(value=>isWellFormedUnicode(value)&&!/[\u0000-\u001f\u007f]/.test(value)),digest=z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema=z.strictObject({projectId:identifier,actorId:identifier,requestId:identifier.min(8),payloadSha256:digest,servedBodySha256:digest,cursor:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)});
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');

/** Проверяет bounded versioned header, не превращая его в внешнюю подпись или новый transport. */
function readMetadata(value:string|null):z.infer<typeof metadataSchema>|null{
 try{
  if(!value||value.length>4096||!value.startsWith('v1.'))return null;
  const packed=value.slice(3);if(!/^[A-Za-z0-9_-]+$/.test(packed))return null;
  const bytes=Uint8Array.from(atob(packed.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-packed.length%4)%4)),character=>character.charCodeAt(0));
  if(btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==packed)return null;
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),parsed=metadataSchema.safeParse(JSON.parse(text));
  return parsed.success&&canonicalCommandJSON(parsed.data)===text?parsed.data:null;
 }catch{return null;}
}

/** Проверяет causal row identity, actual command hash и тот же normalized receipt view после HTTP success. */
export async function verifiedCommandReceiptView(intent:WorkspaceIntent,response:Response,wire:unknown,command:Record<string,unknown>):Promise<ReturnType<typeof commandReceiptProjection>>{
 try{
  if(!response.ok||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')??''))return null;
  if(response.url){const url=new URL(response.url);if(url.pathname!==intent.url||url.search||typeof location!=='undefined'&&url.origin!==location.origin)return null;}
  const metadata=readMetadata(response.headers.get(headerName));
  if(!metadata||metadata.projectId!==intent.projectId||metadata.actorId!==intent.actorId||metadata.requestId!==intent.requestId||command.requestId!==intent.requestId||command.expectedVersion!==intent.expectedVersion||typeof intent.expectedVersion!=='number'||!Number.isSafeInteger(intent.expectedVersion)||intent.expectedVersion<0)return null;
  const receipt=wire as {replayed?:unknown};if(typeof receipt?.replayed!=='boolean')return null;
  const view=commandReceiptProjection(wire,metadata.projectId);if(!view||metadata.cursor!==view.cursor)return null;
  const [payload,served]=await Promise.all([sha256(canonicalCommandJSON(command)),sha256(canonicalProjectJSON(view))]);
  return metadata.payloadSha256===payload&&metadata.servedBodySha256===served?view:null;
 }catch{return null;}
}

/** Отличает отсутствие metadata от присутствующего, но невалидного header. */
export const hasCommandReceiptHeader=(response:Response)=>response.headers.has(headerName);
