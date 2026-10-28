export type CreateDraftIntentBody={specId:string;baseRevisionId:string;requestId:string;expectedVersion:number};
export type PublishDraftIntentBody={requestId:string;expectedVersion:number;draftVersion:number;contentHash:string;baseLatestRevisionId:string};
export type FrozenCollabIntent<T>={actorId:string;request:T};
type Kind='create'|'publish';
type Body=CreateDraftIntentBody|PublishDraftIntentBody;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
const version=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function valid(kind:Kind,value:unknown):value is FrozenCollabIntent<Body>{
  if(!object(value)||!exact(value,['actorId','request'])||!id(value.actorId)||!object(value.request))return false;
  const body=value.request;if(!id(body.requestId)||body.requestId.length<8||!version(body.expectedVersion))return false;
  return kind==='create'?exact(body,['specId','baseRevisionId','requestId','expectedVersion'])&&id(body.specId)&&id(body.baseRevisionId):exact(body,['requestId','expectedVersion','draftVersion','contentHash','baseLatestRevisionId'])&&version(body.draftVersion)&&typeof body.contentHash==='string'&&/^[a-f0-9]{64}$/.test(body.contentHash)&&id(body.baseLatestRevisionId);
}
function key(projectId:string,kind:Kind,draftId?:string){return `ouro:collab-intent:v1:${encodeURIComponent(projectId)}:${kind}${kind==='publish'?`:${encodeURIComponent(draftId??'')}`:''}`;}
export function readCollabIntent(projectId:string,kind:'create'):FrozenCollabIntent<CreateDraftIntentBody>|null;
export function readCollabIntent(projectId:string,kind:'publish',draftId:string):FrozenCollabIntent<PublishDraftIntentBody>|null;
export function readCollabIntent(projectId:string,kind:Kind,draftId?:string):FrozenCollabIntent<Body>|null{
  if(typeof window==='undefined')return null;
  try{const raw=window.sessionStorage.getItem(key(projectId,kind,draftId));if(!raw)return null;const value:unknown=JSON.parse(raw);return valid(kind,value)?value:null;}catch{return null;}
}
/** Only IDs, versions and a hash are retained. Draft text and credentials are excluded. */
export function saveCollabIntent(projectId:string,kind:Kind,intent:FrozenCollabIntent<Body>,draftId?:string):void{
  if(!valid(kind,intent))throw new Error('Не удалось закрепить исходный запрос. Операция не отправлена.');
  try{window.sessionStorage.setItem(key(projectId,kind,draftId),JSON.stringify(intent));}
  catch{throw new Error('Не удалось сохранить запрос в этой вкладке. Операция не отправлена; разрешите sessionStorage и проверьте прежний запрос.');}
}
export function clearCollabIntent(projectId:string,kind:Kind,intent:FrozenCollabIntent<Body>,draftId?:string):void{
  if(typeof window==='undefined')return;
  try{
    const raw=window.sessionStorage.getItem(key(projectId,kind,draftId));if(!raw)return;const stored:unknown=JSON.parse(raw);
    if(valid(kind,stored)&&stored.actorId===intent.actorId&&stored.request.requestId===intent.request.requestId)window.sessionStorage.removeItem(key(projectId,kind,draftId));
  }catch{/* A resolved request may leave harmless metadata, never a new request ID. */}
}
/** Auth and server failures can occur before a previously committed receipt is read. */
export function definitiveIntentFailure(error:unknown):boolean{
  const data=error as {status?:number;code?:string};
  return typeof data.status==='number'&&data.status>=400&&data.status<500&&data.status!==401&&data.status!==403&&['VALIDATION_ERROR','VERSION_CONFLICT','REVISION_CONFLICT','DRAFT_CONFLICT','DRAFT_PUBLISHED'].includes(data.code??'');
}
