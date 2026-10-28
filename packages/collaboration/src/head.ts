export type DraftHead={id:string;projectId:string;specId:string;baseRevisionId:string;createdBy:string;createdAt:string;version:number;stateHash:string;contentHash:string;publishedRevisionId?:string};
export class DraftHeadConflict extends Error{code='DRAFT_HISTORY_CONFLICT';}
const conflict=():never=>{throw new DraftHeadConflict('Сервер прислал несовместимую историю общего черновика. Локальный текст сохранён для экспорта.');};
/** Publication is monotonic metadata; it does not increment the technical version. */
export function adoptDraftHead<T extends DraftHead>(current:T,candidate:T):T{
  if(['id','projectId','specId','baseRevisionId','createdBy','createdAt'].some(key=>current[key as keyof DraftHead]!==candidate[key as keyof DraftHead]))conflict();
  if(!Number.isSafeInteger(candidate.version)||candidate.version<0)conflict();
  if(candidate.version===current.version&&(candidate.stateHash!==current.stateHash||candidate.contentHash!==current.contentHash))conflict();
  if(current.publishedRevisionId){
    if(candidate.publishedRevisionId&&candidate.publishedRevisionId!==current.publishedRevisionId)conflict();
    if(candidate.version>current.version)conflict();
    return current;
  }
  if(candidate.version<current.version){if(candidate.publishedRevisionId)conflict();return current;}
  return candidate;
}
