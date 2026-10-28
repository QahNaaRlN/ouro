import * as Y from 'yjs';
import { createDecoder,hasContent } from 'lib0/decoding';
import type { FlowDefinition, RevisionContent } from '../../core/src/types';

export { Y };
export const DRAFT_TEXT_FIELDS=['title','goal','constraints','assumptions','risks','inputs','comment'] as const;
export type DraftTextField=typeof DRAFT_TEXT_FIELDS[number];
export class DraftDocumentError extends Error{code='VALIDATION_ERROR';}
const invalid=(message:string):never=>{throw new DraftDocumentError(message);};

export function bytesToBase64(bytes:Uint8Array):string{
  let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);
}
export function base64ToBytes(value:string,limit=128*1024):Uint8Array{
  if(typeof value!=='string'||!value.length||value.length>Math.ceil(limit/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return invalid('Нужен корректный base64 update ограниченного размера.');
  const decoded=atob(value);if(decoded.length>limit)return invalid('Update превышает допустимый размер.');
  return Uint8Array.from(decoded,char=>char.charCodeAt(0));
}
export function createDraftDocument(content:RevisionContent):Y.Doc{
  const doc=new Y.Doc({gc:false}),root=doc.getMap('draft');
  doc.transact(()=>{
    for(const field of DRAFT_TEXT_FIELDS)root.set(field,new Y.Text(content[field]));
    const criteria=new Y.Array<Y.Map<unknown>>();root.set('dod',criteria);
    criteria.insert(0,content.dod.map(criterion=>{const map=new Y.Map<unknown>();map.set('id',criterion.id);map.set('text',new Y.Text(criterion.text));map.set('required',criterion.required);return map;}));
  });return doc;
}
export function loadDraftDocument(stateUpdate:string):Y.Doc{
  const doc=new Y.Doc({gc:false});
  try{Y.applyUpdate(doc,base64ToBytes(stateUpdate,1024*1024));return doc;}catch{doc.destroy();return invalid('Не удалось прочитать Yjs-документ.');}
}
export function encodeDraftDocument(doc:Y.Doc):string{return bytesToBase64(Y.encodeStateAsUpdate(doc));}
/** Yjs retains out-of-order structs/delete sets until the missing dependencies arrive. */
export function hasPendingDraftUpdates(doc:Y.Doc):boolean{return !!(doc.store.pendingStructs||doc.store.pendingDs);}
export function applyDraftUpdate(doc:Y.Doc,bytes:Uint8Array):void{
  const decoder=createDecoder(bytes);Y.readUpdate(decoder,doc);
  if(hasContent(decoder))invalid('После Yjs update остались лишние байты.');
}
function plainText(value:unknown,label:string):string{
  if(!(value instanceof Y.Text)||value.constructor!==Y.Text||value._map.size||value.length>20_000)return invalid(`${label}: нужен обычный Y.Text до 20000 символов без скрытых свойств.`);
  if(value.toDelta().some((part:{insert:unknown;attributes?:Record<string,unknown>})=>typeof part.insert!=='string'||part.attributes&&Object.keys(part.attributes).length))return invalid(`${label}: допускается обычный текст без встроенных объектов.`);
  return value.toString();
}
/** Structural validation allows empty draft fields. Domain validation runs on publication. */
export function readDraftContent(doc:Y.Doc,flow?:FlowDefinition):RevisionContent{
  if(doc.share.size!==1||!doc.share.has('draft'))return invalid('Документ содержит неизвестный корневой тип.');
  let root:Y.Map<unknown>;try{root=doc.getMap('draft');}catch{return invalid('Корень черновика должен быть Y.Map.');}
  if(root.constructor!==Y.Map||root._start!==null||root._length!==0)return invalid('Корень Y.Map не должен содержать скрытый список.');
  const keys=[...root.keys()];if(keys.length!==8||keys.some(key=>![...DRAFT_TEXT_FIELDS,'dod'].includes(key as DraftTextField)))return invalid('Набор полей черновика изменён.');
  const text=Object.fromEntries(DRAFT_TEXT_FIELDS.map(field=>[field,plainText(root.get(field),field)])) as Pick<RevisionContent,DraftTextField>;
  const criteria=root.get('dod');if(!(criteria instanceof Y.Array)||criteria.constructor!==Y.Array||criteria._map.size||criteria.length>50)return invalid('DoD должен быть обычным Y.Array до 50 критериев без скрытых свойств.');
  const dod=criteria.toArray().map((criterion:unknown)=>{
    if(!(criterion instanceof Y.Map)||criterion.constructor!==Y.Map||criterion._start!==null||criterion._length!==0||criterion.size!==3||[...criterion.keys()].some(key=>!['id','text','required'].includes(key)))return invalid('Некорректная структура критерия DoD.');
    const id=criterion.get('id'),required=criterion.get('required');
    if(typeof id!=='string'||!id.trim()||id.length>200||typeof required!=='boolean')return invalid('Нужны ID и обязательность критерия DoD.');
    return {id,text:plainText(criterion.get('text'),'DoD'),required};
  });
  return {...text,dod,...(flow?{flow:structuredClone(flow)}:{})};
}

/** Minimal UTF-16 edit; keep surrogate pairs together when the changed glyph differs. */
export function replaceDraftText(text:Y.Text,next:string):void{
  const previous=text.toString();if(previous===next)return;
  let start=0;while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;
  const high=(code:number)=>code>=0xd800&&code<=0xdbff,low=(code:number)=>code>=0xdc00&&code<=0xdfff;
  if(start>0&&high(previous.charCodeAt(start-1))&&low(previous.charCodeAt(start)))start--;
  let tail=0;while(tail<previous.length-start&&tail<next.length-start&&previous[previous.length-1-tail]===next[next.length-1-tail])tail++;
  if(tail>0&&low(previous.charCodeAt(previous.length-tail))&&high(previous.charCodeAt(previous.length-tail-1)))tail--;
  const removed=previous.length-start-tail;if(removed)text.delete(start,removed);
  const inserted=next.slice(start,next.length-tail);if(inserted)text.insert(start,inserted);
}
