'use client';

import { useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent } from 'react';
import { Check,Download,FilePlus2,FileText,LoaderCircle,Plus,RefreshCw,Users,X } from 'lucide-react';
import type { ProjectState,RevisionContent } from '@/packages/core/src';
import type { CollaborativeDraft,CollaborativeDraftSummary } from '@/lib/collaborative-drafts';
import { Y,DRAFT_TEXT_FIELDS,bytesToBase64,base64ToBytes,loadDraftDocument,readDraftContent,replaceDraftText,type DraftTextField } from '@/packages/collaboration/src/document';
import SpecFlow from './spec-flow';
import { ParticipantLogin } from './participants-panel';
import { adoptDraftHead } from '@/packages/collaboration/src/head';
import { readCollabIntent,saveCollabIntent,clearCollabIntent,definitiveIntentFailure,type CreateDraftIntentBody,type PublishDraftIntentBody,type FrozenCollabIntent } from './collab-intent';
import './collaborative-drafts.css';

const names:Record<DraftTextField,string>={title:'Название черновика',goal:'Цель черновика',constraints:'Ограничения черновика',assumptions:'Предположения черновика',risks:'Риски черновика',inputs:'Входы черновика',comment:'Комментарий черновика'};
async function requestJSON(url:string,body?:unknown){
  const response=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let data;try{data=await response.json();}catch{throw Object.assign(new Error('Ответ сервера не подтверждён. Проверьте прежний запрос.'),{code:'INVALID_RESPONSE',status:response.status});}
  if(!response.ok)throw Object.assign(new Error(data.error?.message??'Операция не подтверждена.'),{code:data.error?.code,status:response.status});return data;
}
function download(content:RevisionContent,draft:CollaborativeDraft){
  const blob=new Blob([JSON.stringify({format:'ouro-collaborative-draft',draftId:draft.id,specId:draft.specId,baseRevisionId:draft.baseRevisionId,content},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`ouro-draft-${draft.id}.json`;link.click();URL.revokeObjectURL(url);
}

export default function CollaborativeDraftsPanel({state,actorId,onSnapshot,onOpenSpec,onPendingChange}:{state:ProjectState;actorId:string;onSnapshot:(value:unknown)=>void|Promise<void>;onOpenSpec?:(id:string)=>void;onPendingChange?:(pending:boolean)=>void}){
  const [drafts,setDrafts]=useState<CollaborativeDraftSummary[]>([]),[selected,setSelected]=useState<CollaborativeDraft|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[denied,setDenied]=useState(false);
  const [createIntent,setCreateIntent]=useState(()=>readCollabIntent(state.projectId,'create'));
  const pendingCreate=useRef(createIntent),mounted=useRef(false),pendingCallback=useRef(onPendingChange);pendingCallback.current=onPendingChange;
  const [base,setBase]=useState(()=>createIntent?{specId:createIntent.request.specId,revisionId:createIntent.request.baseRevisionId,version:createIntent.request.expectedVersion}:{specId:state.specs[0]?.id??'',revisionId:state.specs[0]?.revisionIds.at(-1)??'',version:state.version});
  const foreignIntent=!!createIntent&&createIntent.actorId!==actorId;
  const reload=useCallback(async()=>{try{const body=await requestJSON('/api/drafts');if(mounted.current)setDrafts(body.drafts);}catch(e){if(mounted.current){setError((e as Error).message);if([401,403].includes((e as {status?:number}).status??0))setDenied(true);}}},[]);
  useEffect(()=>{mounted.current=true;void reload();const timer=setInterval(()=>void reload(),3000);return()=>{mounted.current=false;clearInterval(timer);};},[reload]);
  useEffect(()=>{pendingCallback.current?.(dirty||!!createIntent);},[dirty,createIntent]);
  useEffect(()=>()=>pendingCallback.current?.(false),[]);
  const markPending=useCallback((value:boolean)=>setDirty(value),[]);
  const forgetCreate=(intent:FrozenCollabIntent<CreateDraftIntentBody>)=>{clearCollabIntent(state.projectId,'create',intent);pendingCreate.current=null;setCreateIntent(null);};
  const open=async(id:string)=>{if(dirty||pendingCreate.current)return;setBusy(true);setError('');try{const body=await requestJSON(`/api/drafts/${encodeURIComponent(id)}`);setSelected(body.draft);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const create=async(event:FormEvent)=>{
    event.preventDefault();if(busy||dirty||foreignIntent||(!pendingCreate.current&&!base.specId))return;setBusy(true);setError('');
    const intent=pendingCreate.current??{actorId,request:{specId:base.specId,baseRevisionId:base.revisionId,requestId:crypto.randomUUID(),expectedVersion:base.version}};
    pendingCreate.current=intent;setCreateIntent(intent);
    try{
      if(intent.actorId!==actorId)throw new Error('Войдите как участник, отправивший исходный запрос.');
      saveCollabIntent(state.projectId,'create',intent);
      const body=await requestJSON('/api/drafts',intent.request);
      if(!body.draft||typeof body.draft.id!=='string'||body.draft.specId!==intent.request.specId||body.draft.baseRevisionId!==intent.request.baseRevisionId||body.draft.createdBy!==intent.actorId)throw new Error('Полученный черновик не подтверждает исходный запрос. Повторите его проверку.');
      forgetCreate(intent);setDenied(false);setSelected(body.draft);await reload();
    }catch(e){if(definitiveIntentFailure(e))forgetCreate(intent);if([401,403].includes((e as {status?:number}).status??0))setDenied(true);setError((e as Error).message);}finally{setBusy(false);}
  };
  return <div className="collab-panel">
    <div className="page-heading"><div><div className="eyebrow">СОВМЕСТНАЯ РАБОТА · ОЖИДАНИЕ</div><h1><Users size={25}/>Совместные черновики</h1><p>Обсуждайте и редактируйте текст вместе. Утверждённые ревизии сохраняются; публикация предлагает новую ревизию без активации.</p></div><button className="btn" onClick={()=>void reload()}><RefreshCw size={14}/>Обновить список</button></div>
    {error&&<p className="collab-warning" role="alert">{error}</p>}
    {createIntent&&<p className="collab-warning">Создание черновика не подтверждено. Исходная основа закреплена; «Проверить создание черновика» повторит тот же запрос. {foreignIntent&&<>Войдите как прежний участник <code>{createIntent.actorId}</code>; другая идентичность не может повторить его запрос.</>}</p>}
    {(denied||foreignIntent)&&<ParticipantLogin/>}
    <section className="collab-section" aria-label="Создать совместный черновик"><h2>Новый совместный черновик</h2><form className="collab-create" onSubmit={create}><label><span>Спецификация для черновика</span><select value={base.specId} disabled={busy||dirty||!!createIntent} onChange={event=>{if(pendingCreate.current)return;const spec=state.specs.find(s=>s.id===event.target.value);setBase({specId:spec?.id??'',revisionId:spec?.revisionIds.at(-1)??'',version:state.version});}}>{state.specs.filter(s=>s.state!=='invalidated').map(spec=><option key={spec.id} value={spec.id}>{spec.humanId} · {spec.title}</option>)}</select></label><button className="btn btn-primary" disabled={busy||dirty||foreignIntent||(!createIntent&&!base.specId)}><Plus size={15}/>{createIntent?'Проверить создание черновика':'Создать общий черновик'}</button></form>{(base.version!==state.version||state.specs.find(s=>s.id===base.specId)?.revisionIds.at(-1)!==base.revisionId)&&<p className="collab-warning">Проект изменился. <button className="text-btn" disabled={busy||dirty||!!createIntent} onClick={()=>{if(pendingCreate.current)return;const spec=state.specs.find(s=>s.id===base.specId);setBase({...base,revisionId:spec?.revisionIds.at(-1)??'',version:state.version});}}>Проверил основу нового черновика</button></p>}<p className="helper-note">Другие участники открывают тот же черновик в списке ниже. Две демо-вкладки — один локальный оператор; отдельные имена и авторство настраиваются в «Участники».</p></section>
    <section className="collab-section" aria-label="Общие черновики"><div className="section-heading"><h2>Общие черновики</h2><span className="quiet-label">{drafts.length}</span></div><div className="collab-list">{drafts.map(draft=><button key={draft.id} className={`collab-draft-card ${draft.id===selected?.id?'selected':''}`} disabled={busy||dirty||!!createIntent} onClick={()=>void open(draft.id)}><strong>{draft.title||'Черновик без названия'}</strong><span>{state.specs.find(s=>s.id===draft.specId)?.humanId} · основа r{state.revisions.find(r=>r.id===draft.baseRevisionId)?.revision} · {draft.publishedRevisionId?'Опубликован':'Редактируется'}</span><code>{draft.id}</code></button>)}</div>{!drafts.length&&<p className="helper-note">Создайте черновик от последней ревизии спецификации.</p>}</section>
    {selected&&!createIntent&&<SharedEditor key={selected.id} initial={selected} actorId={actorId} state={state} onSnapshot={onSnapshot} onOpenSpec={onOpenSpec} onPendingChange={markPending}/>}
  </div>;
}

type PendingUpdate={updateId:string;clientId:string;updateBase64:string};
function SharedEditor({initial,state,actorId,onSnapshot,onOpenSpec,onPendingChange}:{initial:CollaborativeDraft;state:ProjectState;actorId:string;onSnapshot:(value:unknown)=>void|Promise<void>;onOpenSpec?:(id:string)=>void;onPendingChange:(value:boolean)=>void}){
  const [doc]=useState(()=>loadDraftDocument(initial.stateUpdate)),[clientId]=useState(()=>crypto.randomUUID());
  const [head,setHead]=useState(initial),[render,setRender]=useState(0),[pending,setPending]=useState(0),[status,setStatus]=useState<'connecting'|'saved'|'pending'|'offline'|'conflict'|'denied'>('connecting');
  const [storedPublish]=useState(()=>readCollabIntent(state.projectId,'publish',initial.id));
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[publishing,setPublishing]=useState(false),[projectBase,setProjectBase]=useState(storedPublish?.request.expectedVersion??state.version),[publishIntent,setPublishIntent]=useState(storedPublish),[intentDenied,setIntentDenied]=useState(false);
  const hasPublishRetry=!!publishIntent,foreignIntent=!!publishIntent&&publishIntent.actorId!==actorId;
  const headRef=useRef(initial),queue=useRef<PendingUpdate[]>([]),running=useRef<Promise<void>|null>(null),alive=useRef(true),exported=useRef(false),rejectedUpdate=useRef(false),pendingPublish=useRef<FrozenCollabIntent<PublishDraftIntentBody>|null>(storedPublish);
  const selection=useRef<{element:HTMLInputElement|HTMLTextAreaElement;start:Y.RelativePosition;end:Y.RelativePosition;direction:'forward'|'backward'|'none'|null}|null>(null);
  const pendingCallback=useRef(onPendingChange);pendingCallback.current=onPendingChange;
  const content=readDraftContent(doc,initial.content.flow),spec=state.specs.find(s=>s.id===initial.specId)!,base=state.revisions.find(r=>r.id===initial.baseRevisionId)!;
  const stale=spec.revisionIds.at(-1)!==initial.baseRevisionId,readOnly=!!head.publishedRevisionId||publishing||hasPublishRetry||status==='denied'||status==='conflict';
  const announce=()=>{if(!alive.current)return;setPending(queue.current.length);pendingCallback.current((queue.current.length>0&&!exported.current)||!!pendingPublish.current);};
  const textAt=(key:string):Y.Text|undefined=>{
    if(DRAFT_TEXT_FIELDS.includes(key as DraftTextField))return doc.getMap('draft').get(key) as Y.Text;
    if(key.startsWith('dod:'))return (doc.getMap('draft').get('dod') as Y.Array<Y.Map<unknown>>).toArray().find(c=>c.get('id')===key.slice(4))?.get('text') as Y.Text|undefined;
  };
  const merge=(draft:CollaborativeDraft)=>{
    if(!alive.current)return;
    const adopted=adoptDraftHead(headRef.current,draft);
    const element=document.activeElement;
    if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement){const text=textAt(element.dataset.collabField??'');if(text&&element.selectionStart!==null&&element.selectionEnd!==null)selection.current={element,start:Y.createRelativePositionFromTypeIndex(text,element.selectionStart),end:Y.createRelativePositionFromTypeIndex(text,element.selectionEnd),direction:element.selectionDirection};}
    Y.applyUpdate(doc,base64ToBytes(adopted.stateUpdate,1024*1024),'remote');
    headRef.current=adopted;setHead(adopted);
    setRender(value=>value+1);
  };
  useLayoutEffect(()=>{const saved=selection.current;selection.current=null;if(!saved||document.activeElement!==saved.element)return;const start=Y.createAbsolutePositionFromRelativePosition(saved.start,doc),end=Y.createAbsolutePositionFromRelativePosition(saved.end,doc);if(start&&end)saved.element.setSelectionRange(start.index,end.index,saved.direction??undefined);},[render,doc]);
  const sync=():Promise<void>=>{
    if(running.current)return running.current;
    running.current=(async()=>{
      try{
        const fresh=await requestJSON(`/api/drafts/${encodeURIComponent(initial.id)}`);if(!alive.current)return;merge(fresh.draft);
        if(rejectedUpdate.current){setStatus('conflict');return;}
        if(headRef.current.publishedRevisionId&&queue.current.length){setStatus('conflict');setError('Другой участник уже опубликовал черновик. Локальные изменения не приняты; экспортируйте их для нового черновика.');return;}
        while(queue.current.length&&alive.current){
          const item=queue.current[0],body=await requestJSON(`/api/drafts/${encodeURIComponent(initial.id)}/updates`,item);if(!alive.current)return;
          if(queue.current[0]?.updateId===item.updateId)queue.current.shift();merge(body.draft);announce();
        }
        if(alive.current){setStatus(queue.current.length||headRef.current.hasPendingUpdates?'pending':'saved');setError(headRef.current.hasPendingUpdates?'Принятые изменения ожидают связанных updates. Публикация доступна после их получения.':'');}
      }catch(e){if(alive.current){const code=(e as {code?:string}).code,httpStatus=(e as {status?:number}).status;if(httpStatus===422||httpStatus===413||code==='DRAFT_HISTORY_CONFLICT'){rejectedUpdate.current=true;setStatus('conflict');setError(`${(e as Error).message} Изменения не приняты; экспортируйте текст для нового черновика.`);}else{setStatus(code==='DRAFT_PUBLISHED'?'conflict':httpStatus===401||httpStatus===403?'denied':'offline');setError((e as Error).message);}}}
      finally{running.current=null;if(alive.current)announce();}
    })();return running.current;
  };
  const syncRef=useRef(sync);syncRef.current=sync;
  useEffect(()=>{
    alive.current=true;
    const updated=(bytes:Uint8Array,origin:unknown)=>{if(origin!=='remote'){queue.current.push({updateId:crypto.randomUUID(),clientId,updateBase64:bytesToBase64(bytes)});exported.current=false;setStatus('pending');announce();}setRender(value=>value+1);};
    doc.on('update',updated);announce();void syncRef.current();const timer=setInterval(()=>void syncRef.current(),600);
    const online=()=>void syncRef.current(),offline=()=>setStatus('offline'),beforeLeave=(event:BeforeUnloadEvent)=>{if(queue.current.length&&!exported.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('beforeunload',beforeLeave);
    return()=>{alive.current=false;doc.off('update',updated);clearInterval(timer);window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('beforeunload',beforeLeave);pendingCallback.current(false);};
  },[doc,clientId]);
  const setText=(field:DraftTextField,next:string)=>{doc.transact(()=>replaceDraftText(doc.getMap('draft').get(field) as Y.Text,next),'local');};
  const publish=async()=>{
    if(publishing||foreignIntent)return;setPublishing(true);setNotice('');setError('');
    let intent=pendingPublish.current;
    const forget=()=>{if(!intent)return;clearCollabIntent(state.projectId,'publish',intent,initial.id);pendingPublish.current=null;setPublishIntent(null);setIntentDenied(false);announce();};
    try{
      if(!intent){
        const shown=headRef.current;await sync();
        if(queue.current.length||headRef.current.hasPendingUpdates)throw new Error('Сначала отправьте локальные и недостающие связанные изменения.');
        if(shown.version!==headRef.current.version||shown.contentHash!==headRef.current.contentHash)throw new Error('Текст изменился после нажатия. Проверьте новую версию и опубликуйте повторно.');
        intent={actorId,request:{requestId:crypto.randomUUID(),expectedVersion:projectBase,draftVersion:shown.version,contentHash:shown.contentHash,baseLatestRevisionId:initial.baseRevisionId}};
        pendingPublish.current=intent;setPublishIntent(intent);announce();
      }
      if(intent.actorId!==actorId)throw new Error('Войдите как участник, отправивший исходную публикацию.');
      saveCollabIntent(state.projectId,'publish',intent,initial.id);
      const body=await requestJSON(`/api/drafts/${encodeURIComponent(initial.id)}/publish`,intent.request);if(!alive.current)return;
      await onSnapshot(body);if(!alive.current)return;merge(body.draft);forget();setNotice('Новая ревизия предложена. Активация и разрешение исполнения выполняются отдельно.');
    }catch(e){if(definitiveIntentFailure(e))forget();const code=(e as {code?:string}).code;if([401,403].includes((e as {status?:number}).status??0)){setStatus('denied');setIntentDenied(true);}if(code==='DRAFT_HISTORY_CONFLICT'){rejectedUpdate.current=true;setStatus('conflict');}setError((e as Error).message);}finally{if(alive.current)setPublishing(false);}
  };
  const exportLocal=()=>{download(readDraftContent(doc,initial.content.flow),headRef.current);exported.current=true;announce();setNotice('Локальный текст экспортирован. Его можно сравнить с новой основой; экспорт не публикует ревизию.');};
  const criteria=doc.getMap('draft').get('dod') as Y.Array<Y.Map<unknown>>;
  return <section className="collab-section collab-editor" aria-label="Редактор общего черновика" data-draft-id={initial.id}>
    <div className="collab-editor-heading"><div><div className="eyebrow">{spec.humanId} · ОСНОВА r{base.revision}</div><h2>Общий текст</h2><code>{initial.id}</code></div><span className={`collab-sync ${status}`} role="status">{status==='saved'?<Check size={14}/>:status==='pending'||status==='connecting'?<LoaderCircle size={14}/>:<RefreshCw size={14}/>} {status==='saved'?'Все изменения сохранены':status==='pending'?(head.hasPendingUpdates?'Ждём связанные изменения':`Не отправлено: ${pending}`):status==='offline'?`Нет связи · не отправлено: ${pending}`:status==='conflict'?'Изменения требуют сравнения':status==='denied'?'Доступ участника закрыт':'Подключение…'}</span></div>
    <p>Техническая версия {head.version}. Печатание не изменяет утверждённое ожидание. Неотправленный текст сохраняется в этой открытой вкладке; перед закрытием экспортируйте его.</p>
    {error&&<p className="collab-warning" role="alert">{error}</p>}{notice&&<p className="collab-notice" role="status">{notice}</p>}
    {hasPublishRetry&&!publishing&&<p className="collab-warning">Ответ на публикацию не подтверждён. Нажмите «Проверить публикацию», чтобы получить receipt прежнего запроса. {foreignIntent&&<>Войдите как прежний участник <code>{publishIntent.actorId}</code>; повтор от другой идентичности запрещён.</>}</p>}
    {(status==='denied'||intentDenied||foreignIntent)&&<ParticipantLogin/>}
    {stale&&<p className="collab-warning">Основа r{base.revision} устарела: после неё появилась immutable ревизия. Этот текст сохранён. Экспортируйте его и создайте новый черновик от последней основы для сравнения.</p>}
    {head.publishedRevisionId&&<p className="collab-notice">Черновик опубликован как r{state.revisions.find(r=>r.id===head.publishedRevisionId)?.revision??'?'} и доступен для чтения. {queue.current.length>0&&'На экране также сохранён ваш неотправленный локальный текст.'}</p>}
    <div className="collab-fields">{DRAFT_TEXT_FIELDS.map(field=><label key={field} className={field==='goal'?'collab-wide':''}><span>{names[field]}</span>{field==='title'?<input data-collab-field={field} value={content[field]} readOnly={readOnly} maxLength={20000} onChange={e=>setText(field,e.target.value)}/>:<textarea data-collab-field={field} rows={field==='goal'?4:3} value={content[field]} readOnly={readOnly} maxLength={20000} onChange={e=>setText(field,e.target.value)}/>}</label>)}</div>
    <div className="collab-dod"><div className="section-heading"><h3>Критерии DoD черновика</h3><button className="btn btn-small" disabled={readOnly||criteria.length>=50} onClick={()=>doc.transact(()=>{const criterion=new Y.Map<unknown>();criterion.set('id',crypto.randomUUID());criterion.set('text',new Y.Text(''));criterion.set('required',true);criteria.push([criterion]);},'local')}><Plus size={14}/>Добавить критерий</button></div>{criteria.toArray().map((criterion,index)=>{const id=criterion.get('id') as string;return <div className="collab-criterion" key={id}><label><span>Критерий {index+1}</span><textarea data-collab-field={`dod:${id}`} rows={2} value={(criterion.get('text') as Y.Text).toString()} readOnly={readOnly} maxLength={20000} onChange={e=>doc.transact(()=>replaceDraftText(criterion.get('text') as Y.Text,e.target.value),'local')}/></label><label className="collab-required"><input type="checkbox" checked={criterion.get('required') as boolean} disabled={readOnly} onChange={e=>doc.transact(()=>criterion.set('required',e.target.checked),'local')}/>Обязательный</label><button className="icon-btn" aria-label={`Удалить критерий ${index+1}`} disabled={readOnly} onClick={()=>doc.transact(()=>criteria.delete(index,1),'local')}><X size={15}/></button></div>;})}</div>
    <div className="collab-publication"><div><strong>Предложить immutable ревизию</strong><p>Публикация закрепляет просмотренный текст и автора. Активация отдельно.</p>{projectBase!==state.version&&!head.publishedRevisionId&&<p className="collab-warning">Есть новые события проекта. <button className="text-btn" disabled={publishing||hasPublishRetry} onClick={()=>{if(!pendingPublish.current)setProjectBase(state.version);}}>Проверил события перед публикацией</button></p>}</div><div className="collab-actions"><button className="btn" onClick={exportLocal}><Download size={14}/>Экспортировать локальный текст</button><button className="btn" onClick={()=>void sync()} disabled={publishing}><RefreshCw size={14}/>Синхронизировать</button><button className="btn btn-primary" disabled={publishing||foreignIntent||(!hasPublishRetry&&(pending>0||head.hasPendingUpdates||stale||!!head.publishedRevisionId||status!=='saved'))} onClick={()=>void publish()}>{publishing?<LoaderCircle className="spin" size={14}/>:<FilePlus2 size={14}/>} {hasPublishRetry?'Проверить публикацию':'Опубликовать новую ревизию'}</button>{head.publishedRevisionId&&onOpenSpec&&<button className="btn" onClick={()=>onOpenSpec(initial.specId)} disabled={hasPublishRetry||pending>0&&!exported.current}><FileText size={14}/>Открыть спецификацию</button>}</div></div>
    {base.flow&&<details className="collab-flow"><summary>Схема основы r{base.revision} — сохраняется без изменения</summary><p>В этом общем редакторе схема доступна для чтения. После публикации её можно изменить обычным предложением новой процессной ревизии.</p><SpecFlow revision={base} state={state} busy={false} readOnly onSave={async()=>false}/></details>}
  </section>;
}
