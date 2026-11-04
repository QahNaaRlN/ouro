import {createHash} from 'node:crypto';
import {isWellFormedUnicode} from '@ouro/protocol';
import {canonicalCommandJSON} from './command-canonical-json';
import {canonicalProjectJSON,commandReceiptProjection} from '../packages/client/src/lifecycle/project-snapshot';
import type {CommandExecutionWithReceipt} from './store';

export const commandReceiptHeaderName='X-Ouro-Command-Receipt';
const identifier=(value:unknown,minimum=1):value is string=>typeof value==='string'&&value.length>=minimum&&value.length<=200&&isWellFormedUnicode(value)&&!/[\u0000-\u001f\u007f]/.test(value);

/** Преобразует actual SQL bigint cursor без потери точности и без parseInt-послаблений. */
export function persistedCommandCursor(value:unknown):number|null{
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
 if(typeof value!=='string'||!/^(?:0|[1-9]\d*)$/.test(value)||value.length>16)return null;
 const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=0&&String(parsed)===value?parsed:null;
}

/** Строит HTTP proof только из завершённого persisted result и совпадающего normalized served view. */
export function commandReceiptHeader(execution:CommandExecutionWithReceipt):string|undefined{
 try{
  const {row,result}=execution,cursor=persistedCommandCursor(row.cursor);
  if(cursor===null||!identifier(row.project_id)||!identifier(row.actor_id)||!identifier(row.request_id,8)||!/^[a-f0-9]{64}$/.test(row.payload_hash)||typeof result.replayed!=='boolean')return undefined;
  const stored=commandReceiptProjection(row.response,row.project_id),served=commandReceiptProjection(result,row.project_id);
  if(!stored||!served||stored.cursor!==cursor||canonicalProjectJSON(stored)!==canonicalProjectJSON(served))return undefined;
  const metadata={projectId:row.project_id,actorId:row.actor_id,requestId:row.request_id,payloadSha256:row.payload_hash,servedBodySha256:createHash('sha256').update(canonicalProjectJSON(stored)).digest('hex'),cursor};
  const header='v1.'+Buffer.from(canonicalCommandJSON(metadata),'utf8').toString('base64url');return header.length<=4096?header:undefined;
 }catch{return undefined;}
}

/** Сохраняет прежний JSON body, добавляя только bounded post-COMMIT HTTP metadata. */
export function commandReceiptResponse(execution:CommandExecutionWithReceipt):Response{
 const headers=new Headers({'Cache-Control':'no-store'}),proof=commandReceiptHeader(execution);if(proof)headers.set(commandReceiptHeaderName,proof);
 return Response.json(execution.result,{headers});
}
