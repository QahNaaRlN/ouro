import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PROJECT_ID,type Actor,type DomainEvent,type ProjectState,type RevisionContent } from '../packages/core/src';
import { applyDraftUpdate,base64ToBytes,createDraftDocument,encodeDraftDocument,hasPendingDraftUpdates,loadDraftDocument,readDraftContent } from '../packages/collaboration/src/document';

type Connection={query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>};
type Database=Connection&{transaction<T>(fn:(tx:Connection)=>Promise<T>):Promise<T>};
type CommandResult={state:ProjectState;events:DomainEvent[];cursor:number;replayed:boolean};
export type CollaborativeDraft={id:string;projectId:string;specId:string;baseRevisionId:string;createdBy:string;createdAt:string;version:number;stateUpdate:string;stateHash:string;contentHash:string;content:RevisionContent;hasPendingUpdates:boolean;publishedRevisionId?:string;publishedAt?:string};
export type CollaborativeDraftSummary=Omit<CollaborativeDraft,'stateUpdate'|'content'>&{title:string};
type DraftRow={id:string;project_id:string;spec_id:string;base_revision_id:string;created_by:string;created_at:string|Date;version:string|number;state_update_base64:string;state_hash:string;content_hash:string;published_revision_id:string|null;published_at:string|Date|null};
type DraftDependencies={db:Database;serialize:<T>(fn:()=>Promise<T>)=>Promise<T>;lockProject:(tx:Connection)=>Promise<unknown>;assertHuman:(tx:Connection,actor:Actor)=>Promise<void>;state:(tx:Connection)=>Promise<ProjectState>;commit:(tx:Connection,body:unknown,actor:Actor)=>Promise<CommandResult>;hash:(value:unknown)=>string};
export class CollaborativeDraftError extends Error{constructor(public code:string,message:string){super(message);}}
const fail=(code:string,message:string):never=>{throw new CollaborativeDraftError(code,message);};
const id=z.string().trim().min(1).max(200),version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),requestId=z.string().min(8).max(200);
const createInput=z.strictObject({specId:id,baseRevisionId:id,requestId,expectedVersion:version});
const updateInput=z.strictObject({draftId:id,updateId:id,clientId:id,updateBase64:z.string().min(1).max(174_764)});
const publishInput=z.strictObject({draftId:id,requestId,expectedVersion:version,draftVersion:version,contentHash:z.string().regex(/^[a-f0-9]{64}$/),baseLatestRevisionId:id});
const select=`SELECT d.*,h.version,h.state_update_base64,h.state_hash,h.content_hash,h.published_revision_id,h.published_at FROM ouro_collaborative_drafts d JOIN ouro_draft_heads h ON h.draft_id=d.id`;
const stateHash=(value:string)=>createHash('sha256').update(Buffer.from(value,'base64')).digest('hex');

export function createCollaborativeDraftService(deps:DraftDependencies){
  const {db,serialize,lockProject,assertHuman,state:projectState,commit,hash}=deps;
  const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const result=schema.safeParse(value);return result.success?result.data:fail('VALIDATION_ERROR','Поля операции совместного черновика не соответствуют контракту.');};
  const row=async(tx:Connection,draftId:string)=>{
    if(!id.safeParse(draftId).success)fail('VALIDATION_ERROR','Нужен ID совместного черновика.');
    const result=await tx.query<DraftRow>(`${select} WHERE d.id=$1 AND d.project_id=$2`,[draftId,PROJECT_ID]);
    return result.rows[0]??fail('NOT_FOUND','Совместный черновик не найден.');
  };
  const snapshot=(record:DraftRow,state:ProjectState):CollaborativeDraft=>{
    const base=state.revisions.find(r=>r.id===record.base_revision_id&&r.specId===record.spec_id)??fail('NOT_FOUND','Основа совместного черновика не найдена.');
    const doc=loadDraftDocument(record.state_update_base64);
    try{return {id:record.id,projectId:record.project_id,specId:record.spec_id,baseRevisionId:record.base_revision_id,createdBy:record.created_by,createdAt:new Date(record.created_at).toISOString(),version:Number(record.version),stateUpdate:record.state_update_base64,stateHash:record.state_hash,contentHash:record.content_hash,content:readDraftContent(doc,base.flow),hasPendingUpdates:hasPendingDraftUpdates(doc),...(record.published_revision_id?{publishedRevisionId:record.published_revision_id,publishedAt:new Date(record.published_at!).toISOString()}:{})};}finally{doc.destroy();}
  };
  const receipt=async<T>(tx:Connection,actor:Actor,key:string,payloadHash:string):Promise<T|null>=>{
    const found=await tx.query<{payload_hash:string;response:T}>('SELECT payload_hash,response FROM ouro_draft_receipts WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[PROJECT_ID,actor.id,key]);
    if(!found.rows[0])return null;if(found.rows[0].payload_hash!==payloadHash)fail('IDEMPOTENCY_CONFLICT','Этот requestId уже использован для другой операции черновика.');return found.rows[0].response;
  };
  const saveReceipt=(tx:Connection,actor:Actor,key:string,operation:'create'|'publish',payloadHash:string,response:unknown)=>tx.query('INSERT INTO ouro_draft_receipts(project_id,actor_id,request_id,operation,payload_hash,response) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[PROJECT_ID,actor.id,key,operation,payloadHash,JSON.stringify(response)]);
  return {
    createCollaborativeDraft:(body:unknown,actor:Actor):Promise<CollaborativeDraft>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);await assertHuman(tx,actor);const input=parse(createInput,body),payloadHash=hash({operation:'create',...input});
      const duplicate=await receipt<CollaborativeDraft>(tx,actor,input.requestId,payloadHash);if(duplicate)return duplicate;
      const state=await projectState(tx);if(input.expectedVersion!==state.version)fail('VERSION_CONFLICT','Проект изменился; проверьте основу перед созданием черновика.');
      const spec=state.specs.find(s=>s.id===input.specId)??fail('NOT_FOUND','Спецификация не найдена.');
      if(spec.state==='invalidated'||spec.revisionIds.at(-1)!==input.baseRevisionId)fail('REVISION_CONFLICT','Нужна последняя действительная ревизия этой спецификации.');
      const base=state.revisions.find(r=>r.id===input.baseRevisionId&&r.specId===spec.id)??fail('NOT_FOUND','Ревизия не найдена.');
      const doc=createDraftDocument(base);let encoded:string,content:RevisionContent;
      try{encoded=encodeDraftDocument(doc);content=readDraftContent(doc,base.flow);if(Buffer.from(encoded,'base64').length>1024*1024)fail('VALIDATION_ERROR','Исходный Yjs-документ превышает 1 MiB.');}finally{doc.destroy();}
      const draftId=randomUUID();await tx.query('INSERT INTO ouro_collaborative_drafts(id,project_id,spec_id,base_revision_id,created_by) VALUES($1,$2,$3,$4,$5)',[draftId,PROJECT_ID,spec.id,base.id,actor.id]);
      await tx.query('INSERT INTO ouro_draft_heads(draft_id,version,state_update_base64,state_hash,content_hash) VALUES($1,0,$2,$3,$4)',[draftId,encoded,stateHash(encoded),hash(content)]);
      const draft=snapshot(await row(tx,draftId),state);await saveReceipt(tx,actor,input.requestId,'create',payloadHash,draft);return draft;
    })),
    listCollaborativeDrafts:(actor:Actor,specId?:string):Promise<CollaborativeDraftSummary[]>=>serialize(()=>db.transaction(async tx=>{
      await assertHuman(tx,actor);if(specId!==undefined&&!id.safeParse(specId).success)fail('VALIDATION_ERROR','Некорректный ID спеки.');
      const records=await tx.query<DraftRow>(`${select} WHERE d.project_id=$1${specId?' AND d.spec_id=$2':''} ORDER BY d.created_at DESC,d.id LIMIT 100`,specId?[PROJECT_ID,specId]:[PROJECT_ID]);
      const state=await projectState(tx);return records.rows.map(record=>{const {stateUpdate,content,...metadata}=snapshot(record,state);void stateUpdate;return {...metadata,title:content.title};});
    })),
    getCollaborativeDraft:(draftId:string,actor:Actor):Promise<CollaborativeDraft>=>serialize(()=>db.transaction(async tx=>{
      await assertHuman(tx,actor);return snapshot(await row(tx,draftId),await projectState(tx));
    })),
    updateCollaborativeDraft:(body:unknown,actor:Actor):Promise<{draft:CollaborativeDraft;resultVersion:number;replayed:boolean}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);await assertHuman(tx,actor);const input=parse(updateInput,body),payloadHash=hash({...input,actorId:actor.id}),record=await row(tx,input.draftId);
      const duplicate=await tx.query<{payload_hash:string;result_version:number|string}>('SELECT payload_hash,result_version FROM ouro_draft_updates WHERE draft_id=$1 AND update_id=$2',[record.id,input.updateId]);
      if(duplicate.rows[0]){if(duplicate.rows[0].payload_hash!==payloadHash)fail('IDEMPOTENCY_CONFLICT','Update ID уже принят с другими байтами или участником.');return {draft:snapshot(record,await projectState(tx)),resultVersion:Number(duplicate.rows[0].result_version),replayed:true};}
      if(record.published_revision_id)fail('DRAFT_PUBLISHED','Черновик уже опубликован; поздние изменения не приняты. Сохраните их копию и создайте новый черновик.');
      const doc=loadDraftDocument(record.state_update_base64),state=await projectState(tx),base=state.revisions.find(r=>r.id===record.base_revision_id)!;
      let encoded:string,content:RevisionContent;
      try{applyDraftUpdate(doc,base64ToBytes(input.updateBase64));content=readDraftContent(doc,base.flow);encoded=encodeDraftDocument(doc);if(Buffer.from(encoded,'base64').length>1024*1024)fail('VALIDATION_ERROR','Полный Yjs-документ превышает 1 MiB.');}
      catch(error){if(error instanceof CollaborativeDraftError)throw error;fail('VALIDATION_ERROR','Yjs update повреждён или нарушает структуру черновика.');}finally{doc.destroy();}
      const nextHash=stateHash(encoded!),nextVersion=Number(record.version)+(nextHash===record.state_hash?0:1);
      if(nextHash!==record.state_hash)await tx.query('UPDATE ouro_draft_heads SET version=$2,state_update_base64=$3,state_hash=$4,content_hash=$5 WHERE draft_id=$1',[record.id,nextVersion,encoded!,nextHash,hash(content!)]);
      await tx.query('INSERT INTO ouro_draft_updates(draft_id,update_id,actor_id,client_id,payload_hash,update_base64,result_version) VALUES($1,$2,$3,$4,$5,$6,$7)',[record.id,input.updateId,actor.id,input.clientId,payloadHash,input.updateBase64,nextVersion]);
      return {draft:snapshot(await row(tx,record.id),state),resultVersion:nextVersion,replayed:false};
    })),
    publishCollaborativeDraft:(body:unknown,actor:Actor):Promise<CommandResult&{draft:CollaborativeDraft;revisionId:string}>=>serialize(()=>db.transaction(async tx=>{
      await lockProject(tx);await assertHuman(tx,actor);const input=parse(publishInput,body),payloadHash=hash({operation:'publish',...input});
      const duplicate=await receipt<CommandResult&{draft:CollaborativeDraft;revisionId:string}>(tx,actor,input.requestId,payloadHash);if(duplicate)return {...duplicate,replayed:true};
      const record=await row(tx,input.draftId),state=await projectState(tx);
      if(state.version!==input.expectedVersion)fail('VERSION_CONFLICT','Проект изменился. Проверьте новые события перед публикацией.');
      if(record.published_revision_id)fail('DRAFT_PUBLISHED','Черновик уже опубликован.');
      if(Number(record.version)!==input.draftVersion||record.content_hash!==input.contentHash)fail('DRAFT_CONFLICT','Совместный текст изменился. Проверьте новую версию перед публикацией.');
      const spec=state.specs.find(s=>s.id===record.spec_id)!;
      if(input.baseLatestRevisionId!==record.base_revision_id||spec.revisionIds.at(-1)!==record.base_revision_id)fail('REVISION_CONFLICT','После создания черновика появилась другая immutable ревизия. Черновик сохранён, автоматическая смена основы запрещена.');
      const draft=snapshot(record,state),commandId=`draft-publish:${hash({actorId:actor.id,requestId:input.requestId})}`;
      if(draft.hasPendingUpdates)fail('DRAFT_CONFLICT','Часть принятых Yjs updates ожидает зависимостей. Получите отсутствующие изменения перед публикацией.');
      const committed=await commit(tx,{type:'proposeRevision',specId:spec.id,content:draft.content,requestId:commandId,expectedVersion:input.expectedVersion},actor);
      const revisionId=(committed.events.find(event=>event.type==='RevisionProposed')!.payload.revision as {id:string}).id;
      await tx.query('UPDATE ouro_draft_heads SET published_revision_id=$2,published_at=now() WHERE draft_id=$1',[record.id,revisionId]);
      const response={...committed,draft:snapshot(await row(tx,record.id),committed.state),revisionId};await saveReceipt(tx,actor,input.requestId,'publish',payloadHash,response);return response;
    })),
  };
}
