import type { DecisionOutcome, LessonContent, LessonRevision, ProjectState } from './types';
import { isWellFormedUnicode } from './unicode';

export type LessonCandidate = {
  id:string; kind:'rejected_decision'|'unchosen_fork_option'; sourceEventId:string;
  decisionRequestId:string; specId:string; specRevisionId:string; executionId:string;
  title:string; context:string; reason:string; optionId?:string; optionTitle?:string;
};
class LessonInputError extends Error {
  constructor(public code:'VALIDATION_ERROR'|'FORBIDDEN',message:string){super(message);}
}
const invalid=(message:string):never=>{throw new LessonInputError('VALIDATION_ERROR',message);};
const fields=['title','context','conclusion','applicability','evidence','tags','sourceEventIds'] as const;

/** Validate a human-authored conclusion and its actual committed sources; never invent provenance. */
export function validateLessonContent(value:unknown,state:ProjectState):asserts value is LessonContent {
  if(!value||typeof value!=='object'||Array.isArray(value))invalid('Нужно содержание урока.');
  const content=value as Record<string,unknown>;
  if(Object.keys(content).some(key=>!(fields as readonly string[]).includes(key)))invalid('Содержание урока содержит неизвестное поле.');
  for(const field of ['title','context','conclusion','applicability','evidence'] as const){
    const item=content[field],maximum=field==='title'?200:20_000;
    if(typeof item!=='string'||!item.trim()||item.length>maximum||item.includes('\0')||!isWellFormedUnicode(item))invalid(`${field}: требуется непустой корректный текст до ${maximum} символов.`);
  }
  if(!Array.isArray(content.tags)||content.tags.length>20)invalid('У урока не более 20 тегов.');
  const tags=new Set<string>();
  for(const tag of content.tags as unknown[]){
    if(typeof tag!=='string'||!tag.trim()||tag.length>60||tag.includes('\0')||!isWellFormedUnicode(tag))invalid('Тег содержит от 1 до 60 корректных символов.');
    const identity=(tag as string).trim().toLocaleLowerCase('ru-RU');
    if(tags.has(identity))invalid('Теги урока должны различаться.');tags.add(identity);
  }
  if(!Array.isArray(content.sourceEventIds)||content.sourceEventIds.length<1||content.sourceEventIds.length>50)invalid('Нужны 1–50 источников-событий.');
  const sourceIds=new Set<string>();
  for(const sourceId of content.sourceEventIds as unknown[]){
    if(typeof sourceId!=='string'||!sourceId||sourceId.length>200||sourceId!==sourceId.trim()||sourceIds.has(sourceId))invalid('Источник должен иметь уникальный корректный eventId.');
    const id=sourceId as string;sourceIds.add(id);
    const event=state.events.find(event=>event.id===id);
    if(!event)invalid('Источник урока не найден среди зафиксированных событий.');
    if(event!.projectId!==state.projectId)throw new LessonInputError('FORBIDDEN','Источник урока относится к другому проекту.');
  }
}

/** These are curation candidates, not a judgement that an unchosen option is bad. */
export function getLessonCandidates(state:ProjectState):LessonCandidate[] {
  const candidates:LessonCandidate[]=[];
  for(const event of state.events){
    if(event.type!=='DecisionResolved'||event.projectId!==state.projectId)continue;
    const request=state.requests.find(request=>request.id===event.payload.decisionRequestId);
    const outcome=(event.payload.decision as {outcome?:DecisionOutcome}|undefined)?.outcome;
    if(!request||!outcome)continue;
    const context={sourceEventId:event.id,decisionRequestId:request.id,specId:request.specId,specRevisionId:request.specRevisionId,executionId:request.executionId,context:request.context};
    if(outcome.kind==='reject')candidates.push({...context,id:`${event.id}:rejected`,kind:'rejected_decision',title:`Отклонённый запрос: ${request.title}`,reason:outcome.reason});
    else if(request.kind==='Fork'&&outcome.kind==='approve'){
      const chosen=request.options.find(option=>option.id===outcome.chosenOptionId);
      if(!chosen)continue;
      for(const option of request.options.filter(option=>option.id!==outcome.chosenOptionId))candidates.push({...context,id:`${event.id}:option:${option.id}`,kind:'unchosen_fork_option',title:`Невыбранный вариант: ${option.title}`,reason:`Человек выбрал «${chosen.title}». Этот факт не доказывает непригодность остальных вариантов.`,optionId:option.id,optionTitle:option.title});
    }
  }
  return candidates.reverse();
}

/** A derived-from relation is offered only for source specs actually named by source events. */
export function getLessonSourceSpecIds(state:ProjectState,revision:Pick<LessonRevision,'sourceEventIds'>):string[] {
  const sources=new Set(revision.sourceEventIds);
  return [...new Set(state.events.filter(event=>sources.has(event.id)&&event.projectId===state.projectId&&event.specId&&state.specs.some(spec=>spec.id===event.specId&&spec.projectId===state.projectId)).map(event=>event.specId!))];
}
