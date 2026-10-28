'use client';

import {useMemo,useRef,useState,type FormEvent} from 'react';
import {Bot,Check,ChevronRight,FilePlus2,GitBranch,MessageSquareText,Plus,RefreshCw,Search,ShieldCheck,Trash2,X} from 'lucide-react';
import {ReactFlow,Background,Controls,MarkerType,type Node,type Edge} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type {AgentProposal,AgentProposalRevision,DomainEvent,FlowDefinition,ProjectState,RevisionContent} from '@/packages/core/src';
import './agent-proposals-panel.css';

const statusNames={pending:'Ожидает человека',reviewed:'Рассмотрено человеком',dismissed:'Отклонено человеком',adopted:'Создан черновик спеки'};
const sourceNames:Record<string,string>={ActionReported:'Действие',ExecutionCreated:'Разрешение попытки',ExecutionStarted:'ACK начала',ExecutionResumed:'ACK продолжения',ExecutionPaused:'ACK остановки',ExecutionCompleted:'Результат попытки',DecisionRequested:'Запрос решения',DecisionResolved:'Решение человека',DecisionApplied:'Подтверждение применения',BlockerCleared:'Устранение Blocker',RoadmapStateChanged:'Состояние дорожной карты',StopRequested:'Запрос остановки',ResumeAuthorized:'Разрешение продолжения'};
type Pending={actorId:string;body:Record<string,unknown>};
export type ProposalReviewIntentRegistry=Map<string,Pending>;
type Props={state:ProjectState;actorId:string;onSnapshot:(data:unknown)=>void|Promise<void>;onOpenSpec?:(id:string)=>void;intents:ProposalReviewIntentRegistry;initialSelection?:{proposalId:string;proposalRevisionId:string}};

export default function AgentProposalsPanel({state,actorId,onSnapshot,onOpenSpec,intents,initialSelection}:Props){
 const [selectedId,setSelectedId]=useState<string|null>(initialSelection?.proposalId??null),[query,setQuery]=useState('');
 const proposals=state.agentProposals??[],selected=proposals.find(proposal=>proposal.id===selectedId)??proposals.at(-1);
 const visible=proposals.filter(proposal=>{const latest=state.agentProposalRevisions.find(revision=>revision.id===proposal.latestRevisionId);return `${latest?.content.title??''} ${proposal.agentId} ${proposal.specId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());}).toReversed();
 return <div className="agent-proposals-panel">
  <div className="page-heading"><div><div className="eyebrow">REALITY · ИНТЕРПРЕТАЦИЯ И ИСТОЧНИКИ</div><h1>Предложения агента</h1><p>Подключённый агент предлагает. Человек рассматривает источники и задаёт новое ожидание.</p></div><span className="proposal-count"><Bot size={16}/>{proposals.filter(p=>p.state==='pending').length} ожидают</span></div>
  <div className="proposals-layout">
   <section className="proposal-list" aria-label="Предложения подключённых агентов"><label className="proposal-search"><Search size={15}/><input aria-label="Найти предложение" placeholder="Поиск по предложениям" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {!visible.length&&<p className="proposal-empty">Предложений пока нет. Попросите назначенного MCP-агента прочитать источники и вызвать ouro.submit_proposal.</p>}
    {visible.map(proposal=>{const latest=state.agentProposalRevisions.find(revision=>revision.id===proposal.latestRevisionId)!;return <button key={proposal.id} className={`proposal-list-item ${proposal.id===selected?.id?'selected':''}`} aria-label={`Открыть предложение ${latest.content.title}`} onClick={()=>setSelectedId(proposal.id)}><span className="proposal-kind">{latest.content.kind==='spec_proposal'?<FilePlus2 size={14}/>:<MessageSquareText size={14}/>} {latest.content.kind==='spec_proposal'?'Новая спека':'Сводка Reality'}</span><strong>{latest.content.title}</strong><span className="proposal-list-meta">v{latest.revision}<span>{statusNames[proposal.state]}</span></span></button>;})}
   </section>
   {selected?<ProposalDetail key={selected.id} proposal={selected} state={state} actorId={actorId} onSnapshot={onSnapshot} onOpenSpec={onOpenSpec} intents={intents} initialSelection={initialSelection}/>:<div className="proposal-empty proposal-detail-empty"><Bot size={30}/><p>Здесь появятся источники, интерпретация и решение человека.</p></div>}
  </div>
 </div>;
}

function ProposalDetail({proposal,state,actorId,onSnapshot,onOpenSpec,intents,initialSelection}:Props&{proposal:AgentProposal}){
 const versions=state.agentProposalRevisions.filter(revision=>revision.proposalId===proposal.id),[shownId,setShownId]=useState(initialSelection?.proposalId===proposal.id?initialSelection.proposalRevisionId:proposal.latestRevisionId),shown=versions.find(revision=>revision.id===shownId)??versions.at(-1)!;
 const initial=useRef(shown).current,latest=versions.find(revision=>revision.id===proposal.latestRevisionId)!;
 const spec=state.specs.find(spec=>spec.id===proposal.specId),revision=state.revisions.find(revision=>revision.id===proposal.specRevisionId);
 const author=state.events.find(event=>event.actor.id===proposal.agentId&&['AgentProposalSubmitted','AgentProposalRevisionSubmitted'].includes(event.type))?.actor;
 const historical=spec?.activeRevisionId!==proposal.specRevisionId;
 return <section className="proposal-detail" aria-label="Предложение агента">
  <header className="proposal-detail-heading"><div><span className="proposal-kind"><Bot size={15}/>{shown.content.kind==='spec_proposal'?'Предложение новой спеки':'Сводка агента'}</span><h2>{shown.content.title}</h2></div><span className={`proposal-status ${proposal.state}`}>{statusNames[proposal.state]}</span></header>
  <div className="proposal-context"><div><span>Ответственный агент</span><strong>{author?.name??proposal.agentId}</strong></div><div><span>Исходное ожидание</span><strong>{spec?.humanId??proposal.specId} · r{revision?.revision??'?'} · {revision?.title}</strong></div><div><span>Попытка исполнения</span><code>{proposal.executionId}</code></div><div><span>Окно анализа</span><strong>cursor {shown.sourceCursor} · сейчас {state.version}</strong></div></div>
  {historical&&<p className="proposal-attention">Анализ прежней ревизии. Его источники остаются в исходном контексте.</p>}
  <div className="proposal-version"><label>Версия предложения<select aria-label="Версия предложения" value={shown.id} onChange={event=>setShownId(event.target.value)}>{versions.toReversed().map(version=><option value={version.id} key={version.id}>v{version.revision}{version.id===proposal.latestRevisionId?' · последняя':' · история'}</option>)}</select></label>{shown.id!==proposal.latestRevisionId&&<button className="btn btn-small" onClick={()=>setShownId(proposal.latestRevisionId)}><RefreshCw size={13}/>Прочитать новую версию</button>}</div>
  <section className="proposal-findings" aria-label="Наблюдения и первичные источники"><div className="section-heading"><h3>Наблюдения агента</h3><span className="quiet-label">ТОЧНЫЕ ССЫЛКИ НА ФАКТЫ</span></div>{shown.content.findings.map((finding,index)=><article className="proposal-finding" key={index}><div className="proposal-finding-title"><span>{String(index+1).padStart(2,'0')}</span><p>{finding.text}</p></div><div className="proposal-sources">{finding.sourceEventIds.map(id=><SourceFact key={id} event={state.events.find(event=>event.id===id)!}/>)}</div></article>)}</section>
  <section className="proposal-interpretation"><h3>Интерпретация</h3><p>{shown.content.interpretation}</p><h3>Ограничения вывода</h3><p>{shown.content.limitations}</p><p className="proposal-evidence-note"><ShieldCheck size={14}/>Ссылки проверены на принадлежность исполнению. Смысл вывода проверяет человек.</p></section>
  {shown.content.kind==='spec_proposal'&&<section className="proposal-suggested-expectation"><div className="section-heading"><h3>Предложенное ожидание</h3><span className="quiet-label">ТЕКСТ АГЕНТА · v{shown.revision}</span></div><strong>{shown.content.draft.title}</strong><p>{shown.content.draft.goal}</p><ul>{shown.content.draft.dod.map(criterion=><li key={criterion.id}>{criterion.text}</li>)}</ul>{shown.content.draft.flow&&<ProposalFlowPreview flow={shown.content.draft.flow}/>}</section>}
  <ProposalReviewForm proposal={proposal} initial={initial} latest={latest} shown={shown} state={state} actorId={actorId} onSnapshot={onSnapshot} onOpenSpec={onOpenSpec} intents={intents}/>
  {proposal.review&&<div className="proposal-review-record"><strong>{statusNames[proposal.state]}</strong><p>Комментарий агенту: {proposal.review.comment}</p><small>Человек {proposal.review.actorId} · v{versions.find(version=>version.id===proposal.review!.revisionId)?.revision??'?'} · {new Date(proposal.review.at).toLocaleString('ru-RU')}</small>{proposal.review.draftSpecId&&<button className="text-btn" onClick={()=>onOpenSpec?.(proposal.review!.draftSpecId!)}>Открыть созданный черновик<ChevronRight size={14}/></button>}</div>}
 </section>;
}

function SourceFact({event}:{event:DomainEvent}){
 const source=event.payload.source as {kind?:string;verificationMethod?:string}|undefined;
 return <details className="proposal-source"><summary><span>{sourceNames[event.type]??event.type}</span><code>#{event.version}</code><span>{event.actor.name??event.actor.id}</span></summary><div><strong>{String(event.payload.title??sourceNames[event.type]??event.type)}</strong><code>{event.id}</code>{event.specRevisionId&&<small>Ревизия {event.specRevisionId}</small>}{event.payload.evidence!==undefined&&<p>{String(event.payload.evidence)}</p>}{event.payload.simulation===true&&<span className="proposal-source-tag">Учебная симуляция</span>}{source?.kind==='github_commit'&&<span className="proposal-source-tag">GitHub · {source.verificationMethod}</span>}<details><summary>Полная исходная запись</summary><pre>{JSON.stringify(event,null,2)}</pre></details></div></details>;
}

function ProposalReviewForm({proposal,initial,latest,shown,state,actorId,onSnapshot,onOpenSpec,intents}:Props&{proposal:AgentProposal;initial:AgentProposalRevision;latest:AgentProposalRevision;shown:AgentProposalRevision}){
 const intentKey=`${state.projectId}:${proposal.id}`,heldIntent=intents.get(intentKey),held=heldIntent?.body;
 const [content,setContent]=useState<RevisionContent|null>(()=>held?.type==='adoptAgentSpecProposal'?structuredClone(held.content as RevisionContent):initial.content.kind==='spec_proposal'?structuredClone(initial.content.draft):null),[comment,setComment]=useState(typeof held?.comment==='string'?held.comment:''),[derived,setDerived]=useState(held?.sourceSpecId===proposal.specId);
 const [base,setBase]=useState({proposalRevisionId:typeof held?.proposalRevisionId==='string'?held.proposalRevisionId:initial.id,version:typeof held?.expectedVersion==='number'?held.expectedVersion:state.version}),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(!!held),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<Pending|null>(heldIntent??null),closed=proposal.state!=='pending',stale=base.proposalRevisionId!==proposal.latestRevisionId,viewingHistory=shown.id!==latest.id,readonly=closed||uncertain||viewingHistory;
 const clearIntent=(body:Record<string,unknown>)=>{if(intents.get(intentKey)?.body.requestId===body.requestId)intents.delete(intentKey);pending.current=null;};
 const request=async(body:Record<string,unknown>,expectedActorId=actorId)=>{
  if(busy)return;pending.current={actorId:expectedActorId,body};intents.set(intentKey,pending.current);setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/commands',{method:'POST',headers:{'Content-Type':'application/json','X-Ouro-Expected-Participant':expectedActorId},body:JSON.stringify(body)}),data=await response.json();
   if(!response.ok){
    // Auth/rate failures happen before receipt lookup and cannot settle a
    // previously ambiguous write. A domain conflict follows receipt lookup.
    const receiptAwareRejection=['VERSION_CONFLICT','REVISION_CONFLICT','INVALID_TRANSITION','VALIDATION_ERROR','NOT_FOUND','DEPENDENCY_CYCLE'].includes(data.error?.code);
    if(response.status<500&&(!uncertain||receiptAwareRejection)){clearIntent(body);setUncertain(false);}
    throw new Error(data.error?.message??'Рассмотрение не записано.');
   }
   await onSnapshot(data);clearIntent(body);setUncertain(false);setNotice('Рассмотрение записано. Активация новой спеки выполняется отдельно.');
   const created=(data.events as DomainEvent[]).find(event=>event.type==='SpecCreated');if(created?.specId)onOpenSpec?.(created.specId);
  }catch(e){if(pending.current)setUncertain(true);setError(e instanceof Error?e.message:'Не удалось определить результат записи.');}finally{setBusy(false);}
 };
 const submit=(outcome:'adopt'|'reviewed'|'dismissed')=>{
  if(closed||stale||uncertain||busy||viewingHistory||!comment.trim())return;
  const body={requestId:crypto.randomUUID(),expectedVersion:base.version,proposalId:proposal.id,proposalRevisionId:base.proposalRevisionId,comment};
  if(outcome==='adopt'&&content)void request({...body,type:'adoptAgentSpecProposal',content:structuredClone(content),...(derived?{sourceSpecId:proposal.specId}:{})});
  else if(outcome!=='adopt')void request({...body,type:'reviewAgentProposal',outcome});
 };
 const onSubmit=(event:FormEvent)=>{event.preventDefault();submit(content?'adopt':'reviewed');};
 const update=(key:Exclude<keyof RevisionContent,'dod'|'flow'>,value:string)=>setContent(current=>current?{...current,[key]:value}:current);
 return <form className="proposal-review-form" aria-label="Рассмотрение предложения" onSubmit={onSubmit}>
  <div className="section-heading"><h3>{content?'Подготовить новое ожидание':'Рассмотреть сводку'}</h3><span className="quiet-label">ЧЕЛОВЕК · ОСНОВА v{state.agentProposalRevisions.find(revision=>revision.id===base.proposalRevisionId)?.revision??'?'}</span></div>
  {stale&&<p className="proposal-attention">Агент предложил новую версию. Введённый текст сохранён для сравнения; устаревшая запись заблокирована.</p>}
  {viewingHistory&&!stale&&<p className="proposal-attention">Просмотр прежней версии доступен только для чтения. Для записи выберите последнюю версию.</p>}
  {closed&&<p className="proposal-attention">Предложение уже рассмотрено. Введённый текст сохранён для чтения и копирования.</p>}
  {!uncertain&&!closed&&(base.version!==state.version||stale)&&<div className="proposal-basis"><span>Перед записью проверьте последнюю версию и новые события.</span><button type="button" className="btn btn-small" disabled={busy||shown.id!==latest.id} onClick={()=>{setBase({proposalRevisionId:latest.id,version:state.version});setError('');}}>Обновить основу, сохранив мой текст</button></div>}
  {content&&<>
   <label>Название новой спеки<input required maxLength={20000} value={content.title} readOnly={readonly} disabled={busy} onChange={event=>update('title',event.target.value)}/></label>
   <label>Цель новой спеки<textarea required rows={3} maxLength={20000} value={content.goal} readOnly={readonly} disabled={busy} onChange={event=>update('goal',event.target.value)}/></label>
   <fieldset className="proposal-dod"><legend>Критерии DoD</legend>{content.dod.map((criterion,index)=><div key={criterion.id}><label className="proposal-criterion"><span>Критерий {index+1}</span><textarea required rows={2} maxLength={20000} value={criterion.text} readOnly={readonly} disabled={busy} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(c=>c.id===criterion.id?{...c,text:event.target.value}:c)}:current)}/></label><label className="proposal-checkbox"><input type="checkbox" checked={criterion.required} disabled={readonly||busy} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(c=>c.id===criterion.id?{...c,required:event.target.checked}:c)}:current)}/>Обязательный</label>{!readonly&&<button aria-label={`Удалить критерий ${index+1}`} type="button" className="icon-btn" disabled={busy||content.dod.length<=1} onClick={()=>setContent(current=>current?{...current,dod:current.dod.filter(c=>c.id!==criterion.id)}:current)}><Trash2 size={14}/></button>}</div>)}{!readonly&&<button type="button" className="text-btn" disabled={busy||content.dod.length>=50} onClick={()=>setContent(current=>current?{...current,dod:[...current.dod,{id:crypto.randomUUID(),text:'',required:true}]}:current)}><Plus size={14}/>Добавить критерий</button>}</fieldset>
   <div className="proposal-fields">{([['constraints','Ограничения новой спеки'],['assumptions','Допущения новой спеки'],['risks','Риски новой спеки'],['inputs','Входные данные новой спеки'],['comment','Комментарий к спеке']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={2} maxLength={20000} value={content[key]} readOnly={readonly} disabled={busy} onChange={event=>update(key,event.target.value)}/></label>)}</div>
   {content.flow&&<p className="proposal-evidence-note"><GitBranch size={14}/>Схема сохраняется в черновике. Редактор процесса доступен после создания спеки.</p>}
   <label className="proposal-checkbox"><input type="checkbox" checked={derived} disabled={readonly||busy} onChange={event=>setDerived(event.target.checked)}/>Добавить явную связь происхождения с исходной спекой</label>
  </>}
  <label>Комментарий агенту<textarea aria-label="Комментарий агенту" required rows={2} maxLength={20000} value={comment} readOnly={readonly} disabled={busy} onChange={event=>setComment(event.target.value)}/><small>Будет виден назначенному агенту в исходном исполнении.</small></label>
  {error&&<p className="proposal-error" role="alert">{error}</p>}{notice&&<p className="proposal-success" role="status">{notice}</p>}
  {uncertain?<div className="proposal-attention" role="status">Результат записи неизвестен. Сначала повторите тот же запрос, чтобы выяснить сохранённый результат.<button type="button" className="btn" disabled={busy} onClick={()=>{if(pending.current)void request(pending.current.body,pending.current.actorId);}}><RefreshCw size={14}/>Повторить сохранение</button></div>:!closed&&<div className="proposal-review-actions"><button className="btn btn-primary" type="submit" disabled={busy||stale||viewingHistory}>{content?<FilePlus2 size={15}/>:<Check size={15}/>} {content?'Создать черновик спеки':'Отметить рассмотренным'}</button><button className="btn" type="button" disabled={busy||stale||viewingHistory||!comment.trim()} onClick={()=>submit('dismissed')}><X size={15}/>Отклонить предложение</button></div>}
 </form>;
}

function ProposalFlowPreview({flow}:{flow:FlowDefinition}){
 const {nodes,edges}=useMemo(()=>{
  const graph=new dagre.graphlib.Graph().setGraph({rankdir:'LR',nodesep:28,ranksep:75}).setDefaultEdgeLabel(()=>({}));flow.nodes.forEach(node=>graph.setNode(node.id,{width:200,height:76}));flow.edges.forEach(edge=>graph.setEdge(edge.source,edge.target));dagre.layout(graph);
  const nodes:Node[]=flow.nodes.map(node=>{const position=graph.node(node.id);return {id:node.id,position:{x:position.x-100,y:position.y-38},data:{label:<div><small>{node.owner==='human'?'Человек':node.owner==='agent'?'Агент':'Система'}</small><strong>{node.title}</strong></div>},style:{width:200,background:'var(--subtle)',color:'var(--text)',border:'1px solid var(--control)',borderRadius:6}};});
  const edges:Edge[]=flow.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,label:edge.label,markerEnd:{type:MarkerType.ArrowClosed,color:'var(--graph-edge)'},style:{stroke:'var(--graph-edge)'},labelStyle:{fill:'var(--text-muted)',fontSize:11},labelBgStyle:{fill:'var(--bg)'}}));return {nodes,edges};
 },[flow]);
 return <section className="proposal-flow" aria-label="Схема предлагаемого черновика"><div><strong>Процесс из предложения</strong><span>Возможный процесс · фактов исполнения нет</span></div><div className="proposal-flow-canvas"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={.25} maxZoom={1.6}><Background color="var(--graph-dot)" gap={18}/><Controls showInteractive={false}/></ReactFlow></div><details><summary>Таблица процесса</summary><table><thead><tr><th>Шаг</th><th>Ответственный</th><th>Переходы</th></tr></thead><tbody>{flow.nodes.map(node=><tr key={node.id}><td>{node.title}</td><td>{node.owner}</td><td>{flow.edges.filter(edge=>edge.source===node.id).map(edge=>`${edge.label} → ${flow.nodes.find(n=>n.id===edge.target)?.title}`).join('; ')||'Результат'}</td></tr>)}</tbody></table></details></section>;
}
