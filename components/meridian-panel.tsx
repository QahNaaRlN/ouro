'use client';

import {useEffect,useRef,useState,type ChangeEvent,type CSSProperties,type FormEvent} from 'react';
import {ArrowDownToLine,FileJson,FilePlus2,LoaderCircle,RefreshCw,ShieldQuestion} from 'lucide-react';
import type {DomainEvent,ProjectState,RevisionContent} from '@/packages/core/src';
import {mapMeridianExpectation,parseMeridianScope,type Pin,type WorkScopeView} from '@/packages/meridian/src/context';
import {getMeridianThemeVariables} from '@/packages/meridian/src/theme';
import './meridian-panel.css';

type ImportBody={requestId:string;expectedVersion:number;rawDocument:string;content:RevisionContent};
export type MeridianPendingIntent={projectId:string;participantKey:string;filename:string;body:ImportBody};
export type MeridianIntentCache={current:MeridianPendingIntent|null};
const fields=[['goal','Цель черновика'],['constraints','Ограничения черновика'],['inputs','Входные данные черновика'],['assumptions','Допущения черновика'],['risks','Риски черновика'],['comment','Комментарий к черновику']] as const;
export function MeridianPin({label,pin}:{label:string;pin:Pin}){
  return <div className="meridian-pin"><span>{label}</span><strong>{pin.key.id} · r{pin.revision}</strong><code>{pin.sha256}</code></div>;
}

export default function MeridianPanel({state,onSnapshot,onOpenSpec,theme,pendingIntent,participantKey}:{state:ProjectState;onSnapshot:(data:unknown)=>void|Promise<void>;onOpenSpec?:(id:string)=>void;theme:'light'|'dark';pendingIntent:MeridianIntentCache;participantKey:string}){
  const [recovered]=useState(()=>{
    const saved=pendingIntent.current;
    if(saved&&saved.projectId===state.projectId&&saved.participantKey===participantKey)return structuredClone(saved);
    if(saved)pendingIntent.current=null;
    return null;
  });
  const [view,setView]=useState<WorkScopeView|null>(()=>recovered?parseMeridianScope(recovered.body.rawDocument):null),[rawDocument,setRawDocument]=useState(recovered?.body.rawDocument??''),[content,setContent]=useState<RevisionContent|null>(recovered?.body.content??null);
  const [filename,setFilename]=useState(recovered?.filename??''),[baseVersion,setBaseVersion]=useState(recovered?.body.expectedVersion??state.version),[busy,setBusy]=useState(false),[reading,setReading]=useState(false);
  const [error,setError]=useState(recovered?'Результат импорта не подтверждён. Восстановлен прежний пакет; повторите его для получения квитанции.':''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(!!recovered),[createdId,setCreatedId]=useState<string|null>(null);
  const pending=useRef<ImportBody|null>(recovered?.body??null),running=useRef(false),readEpoch=useRef(0),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const clearIntent=(body:ImportBody)=>{
    const saved=pendingIntent.current;
    if(saved?.projectId===state.projectId&&saved.participantKey===participantKey&&saved.body.requestId===body.requestId)pendingIntent.current=null;
  };
  const sealed=busy||uncertain||createdId!==null;
  const load=async(event:ChangeEvent<HTMLInputElement>)=>{
    if(sealed)return;const file=event.target.files?.[0],epoch=++readEpoch.current;
    setView(null);setContent(null);setRawDocument('');setError('');setNotice('');setFilename('');pending.current=null;
    if(!file)return;setReading(true);
    try{
      if(file.size>524288)throw new Error('Файл превышает 512 KiB. Выберите меньший контекст.');
      const bytes=new Uint8Array(await file.arrayBuffer()),parsed=parseMeridianScope(bytes);
      // Keep BOM and reject malformed UTF-8 rather than silently repairing source bytes.
      const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),mapped=mapMeridianExpectation(parsed);
      if(epoch!==readEpoch.current)return;
      setView(parsed);setRawDocument(raw);setContent(mapped);setFilename(file.name);setBaseVersion(state.version);
    }catch(e){if(epoch===readEpoch.current)setError(e instanceof Error?e.message:'Не удалось прочитать закрытый контракт Meridian.');}
    finally{if(epoch===readEpoch.current)setReading(false);}
  };
  const edit=(key:typeof fields[number][0]|'title',value:string)=>{
    if(sealed||!content)return;setContent({...content,[key]:value});setError('');setNotice('');pending.current=null;
  };
  const send=async(body:ImportBody)=>{
    if(running.current)return;running.current=true;setBusy(true);setError('');setNotice('');
    pendingIntent.current={projectId:state.projectId,participantKey,filename,body:structuredClone(body)};
    const wasUncertain=uncertain;
    let definitiveRejection=false,confirmedNoReceipt=false;
    try{
      const response=await fetch('/api/meridian/import',{method:'POST',headers:{'Content-Type':'application/json','X-Ouro-Expected-Participant':participantKey},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok){
        definitiveRejection=response.status>=400&&response.status<500;
        confirmedNoReceipt=response.status===409&&result.error?.code==='VERSION_CONFLICT'&&result.error?.details?.meridianReceipt==='absent';
        throw new Error(result.error?.message??'Импорт не принят сервером.');
      }
      const created=(result.events as DomainEvent[]|undefined)?.find(event=>event.type==='SpecCreated');
      if(!created?.specId)throw new Error('Квитанция импорта не получена.');
      await onSnapshot(result);
      clearIntent(body);
      if(!mounted.current)return;
      setUncertain(false);setCreatedId(created.specId);pending.current=null;
      setNotice('Черновик создан. Исходный документ сохранён; активация остаётся отдельным действием.');
      onOpenSpec?.(created.specId);
    }catch(e){
      const detail=e instanceof Error?e.message:'Не удалось получить ответ сервера.';
      // A later denial proves only that this retry failed. The original call
      // may already have committed, so its body stays sealed until a receipt.
      if((definitiveRejection&&!wasUncertain)||confirmedNoReceipt){clearIntent(body);pending.current=null;if(mounted.current){setUncertain(false);setError(detail);}}
      else if(mounted.current){setUncertain(true);setError(`Результат импорта не подтверждён. ${detail} Повторите тот же импорт, чтобы получить его квитанцию.`);}
    }finally{running.current=false;if(mounted.current)setBusy(false);}
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();if(!content||!view||sealed||reading)return;
    const body:ImportBody={requestId:crypto.randomUUID(),expectedVersion:baseVersion,rawDocument,content:structuredClone(content)};
    pending.current=body;void send(body);
  };
  const reset=()=>{
    if(sealed&&createdId===null)return;
    readEpoch.current++;pending.current=null;setCreatedId(null);setView(null);setContent(null);setRawDocument('');setFilename('');setError('');setNotice('');setUncertain(false);
  };
  const facts=view?.facts;
  return <section className="meridian-panel" aria-label="Импорт контекста Meridian" data-theme={theme} style={getMeridianThemeVariables(theme) as CSSProperties}>
    <div className="meridian-heading"><div><div className="eyebrow">MERIDIAN · ОЖИДАНИЕ И КОНТЕКСТ</div><h1><FileJson size={22}/>Контекст Meridian</h1><p>Загрузите снимок выбранной работы, проверьте ожидание и создайте черновик спеки.</p></div><div className="meridian-heading-badges"><span className="meridian-badge">Импорт файла</span><span className="meridian-badge">Тема выбрана в Ouro: {theme==='light'?'светлая':'тёмная'}</span></div></div>
    <p className="meridian-boundary">Файл проверяется по контракту work-scope v1. Импорт сохраняет происхождение, а активацию и разрешение работы выполняет человек в Ouro.</p>
    {!createdId&&<label className="meridian-file"><span><ArrowDownToLine size={16}/>JSON контекста Meridian</span><input type="file" accept=".json,application/json" aria-label="JSON контекста Meridian" disabled={sealed||reading} onChange={event=>void load(event)}/><small>До 512 KiB · снимок meridian-work-scope-view/v1</small></label>}
    {reading&&<p className="meridian-note" role="status"><LoaderCircle size={15} className="spin"/>Проверяем формат и привязки…</p>}
    {error&&<div className="meridian-error" role="alert">{error}</div>}
    {notice&&<div className="meridian-notice" role="status">{notice}</div>}
    {view&&facts&&content&&<>
      <section className="meridian-preview" aria-label="Предпросмотр Meridian">
        <div className="section-heading"><h3>Исходный контекст</h3><span className="meridian-badge">Формат проверен</span></div>
        <p className="meridian-trust"><ShieldQuestion size={16}/><span><strong>Подлинность источника не проверена</strong><br/>Содержимое файла — заявленные факты источника. Связь с работающим Meridian не установлена.</span></p>
        <dl className="meridian-meta"><div><dt>Файл</dt><dd>{filename}</dd></div><div><dt>Проект</dt><dd>{facts.project_id}</dd></div><div><dt>Репозиторий</dt><dd>{facts.repository_id}</dd></div><div><dt>Workspace</dt><dd>{facts.subject_ref.workspace_id}</dd></div><div><dt>Провайдер</dt><dd>{facts.subject_ref.provider_id}</dd></div><div><dt>Снимок</dt><dd>{view.snapshot_id}</dd></div></dl>
        <div className="meridian-pins"><MeridianPin label="Спецификация источника" pin={facts.task_specification_pin}/><MeridianPin label="Попытка источника" pin={facts.run_ref.run}/><MeridianPin label="Манифест контекста" pin={facts.context_manifest_pin}/></div>
        <details><summary>Источники, границы и незакрытые вопросы</summary><div className="meridian-source-details"><h4>Объявленные пути</h4><p>{facts.declared_scope.declared_paths.join(', ')}</p><h4>Проверка источников</h4><p>Внешние источники: не проверены. Готовность действия: не подтверждена. Утверждение снимка о внутренних pins: verified.</p>{facts.authoritative_sources.map(source=><p key={source.id}><strong>{source.id}</strong> · {source.reference}<br/>{source.purpose} · разрешение: {source.resolution}</p>)}{facts.applicable_norms.map(norm=><p key={norm.id}><strong>{norm.id}</strong> · {norm.reference}<br/>{norm.applicability_rationale}</p>)}{facts.decisions.map(decision=><p key={decision.id}><strong>{decision.id}</strong> · {decision.text}</p>)}{facts.resolution.conflicts.map((item,index)=><p key={`conflict-${index}`}>{item.reason}</p>)}{facts.resolution.unresolved_items.map((item,index)=><p key={`unresolved-${index}`}>{item.item}: {item.reason}</p>)}{facts.resolution.unresolved_applicability.map((item,index)=><p key={`applicability-${index}`}>{item.subject}: {item.reason}</p>)}{facts.resolution.requires_reresolution&&<p>Источник требует повторного определения применимости.</p>}{facts.resolution.decomposition_required&&<p>Источник требует декомпозиции.</p>}</div></details>
      </section>
      <form className="meridian-form" onSubmit={submit} aria-label="Ожидание из Meridian">
        <div className="section-heading"><h3>Ожидание для Ouro</h3><span className="quiet-label">ЧЕРНОВИК · БАЗА {baseVersion}</span></div>
        <label><span>Название черновика</span><input required maxLength={200} value={content.title} readOnly={sealed} onChange={event=>edit('title',event.target.value)}/></label>
        {fields.map(([key,label])=><label key={key}><span>{label}</span><textarea required={key==='goal'} maxLength={20000} rows={key==='inputs'?5:3} readOnly={sealed} value={content[key]} onChange={event=>edit(key,event.target.value)}/></label>)}
        <fieldset className="meridian-dod" disabled={busy}><legend>Критерии DoD</legend>{content.dod.map((criterion,index)=><div className="meridian-criterion" key={criterion.id}><label><span>Критерий {index+1}</span><textarea required maxLength={20000} rows={4} value={criterion.text} readOnly={sealed} onChange={event=>{if(sealed)return;setContent({...content,dod:content.dod.map((item,at)=>at===index?{...item,text:event.target.value}:item)});pending.current=null;setError('');}}/></label><label className="meridian-required"><input type="checkbox" checked={criterion.required} disabled={sealed} onChange={event=>setContent({...content,dod:content.dod.map((item,at)=>at===index?{...item,required:event.target.checked}:item)})}/>Обязательный критерий</label><small>Критерий источника: {facts.goal.acceptance_criteria[index]?.id??criterion.id}</small></div>)}</fieldset>
        {!sealed&&baseVersion!==state.version&&<div className="meridian-conflict" role="status">Появились новые события. Проверьте контекст перед записью.<button type="button" className="text-btn" onClick={()=>{setBaseVersion(state.version);pending.current=null;setError('');}}>Обновить базу после проверки</button></div>}
        {uncertain?<div className="meridian-actions"><button className="btn btn-primary" type="button" disabled={busy||!pending.current} onClick={()=>{if(pending.current)void send(pending.current);}}><RefreshCw size={15}/>Повторить тот же импорт</button><p>Поля сохранены. До получения квитанции повтор отправит исходное содержание и requestId.</p></div>:createdId?<div className="meridian-actions"><button className="btn" type="button" onClick={()=>onOpenSpec?.(createdId)}>Открыть созданный черновик</button><button className="text-btn" type="button" onClick={reset}>Импортировать другой контекст</button></div>:<div className="meridian-actions"><button className="btn btn-primary" type="submit" disabled={busy||reading||!content.dod.length}>{busy?<LoaderCircle size={15} className="spin"/>:<FilePlus2 size={15}/>}Создать черновик спеки</button><p>Создаётся идея без активной ревизии и попытки исполнения.</p></div>}
      </form>
    </>}
  </section>;
}
