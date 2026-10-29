'use client';

import {useMemo,useRef,useState,type FormEvent} from 'react';
import {Background,Controls,MarkerType,ReactFlow,type Edge,type Node} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type {AgentProposal,AgentProposalRevision,DomainEvent,FlowDefinition,ProjectState,RevisionContent} from '@/packages/core/src';
import type {WorkspaceCommand} from './workspace-decisions';

type Props={state:ProjectState;command:WorkspaceCommand;disabled:boolean;onOpenSpec:(id:string)=>void};
const statuses:Record<AgentProposal['state'],string>={pending:'Ожидает рассмотрения',reviewed:'Рассмотрено человеком',dismissed:'Отклонено человеком',adopted:'Создан черновик спеки'};
const sourceNames:Record<string,string>={ActionReported:'Действие агента',ExecutionStarted:'ACK начала',ExecutionResumed:'ACK продолжения',ExecutionPaused:'ACK остановки',ExecutionCompleted:'Результат попытки',DecisionRequested:'Запрос человеку',DecisionResolved:'Решение человека',DecisionApplied:'Подтверждение применения',BlockerCleared:'Устранение блокера',FlowStepStarted:'Начало прохода',FlowStepCompleted:'Результат прохода',FlowStepFailed:'Неуспех прохода',FlowStepSkipped:'Пропуск человеком',FlowStepRetried:'Повтор человеком',FlowEdgeTraversed:'Переход процесса'};
const ownerNames={human:'Человек',agent:'Агент',system:'Система'};

export function WorkspaceProposals({state,command,disabled,onOpenSpec}:Props){
  return <section className="ws-panel" aria-label="Предложения агентов">
    <div className="ws-section-top"><h2>Предложения агентов</h2><span className="ws-muted">{state.agentProposals.filter(proposal=>proposal.state==='pending').length} ожидают</span></div>
    <p className="ws-muted">Агент предлагает сводку или новую спеку с источниками. Человек проверяет выводы и отдельно задаёт ожидание.</p>
    {!state.agentProposals.length&&<p className="ws-muted">Предложений пока нет. Назначенный MCP-агент может отправить их через ouro.submit_proposal.</p>}
    {state.agentProposals.toReversed().map(proposal=><ProposalCard key={`${state.projectId}:${proposal.id}`} proposal={proposal} state={state} command={command} disabled={disabled} onOpenSpec={onOpenSpec}/>)}
  </section>;
}

function ProposalCard({proposal,state,command,disabled,onOpenSpec}:Props&{proposal:AgentProposal}){
  const versions=state.agentProposalRevisions.filter(revision=>revision.proposalId===proposal.id);
  const latest=versions.find(revision=>revision.id===proposal.latestRevisionId);
  const [shownId,setShownId]=useState(proposal.latestRevisionId);
  if(!latest)return <article className="ws-proposal"><p className="ws-error">Версия предложения отсутствует в снимке. Перечитайте историю проекта.</p></article>;
  const shown=versions.find(revision=>revision.id===shownId)??latest;
  const spec=state.specs.find(item=>item.id===proposal.specId),sourceRevision=state.revisions.find(revision=>revision.id===proposal.specRevisionId);
  const submitted=state.events.find(event=>event.actor.id===proposal.agentId&&['AgentProposalSubmitted','AgentProposalRevisionSubmitted'].includes(event.type));
  return <article className="ws-proposal" aria-label={`Предложение: ${latest.content.title}`} data-proposal-id={proposal.id}>
    <div className="ws-section-top"><h3>{latest.content.title}</h3><span className="ws-badge">{statuses[proposal.state]}</span></div>
    <p className="ws-muted">{latest.content.kind==='spec_proposal'?'Предложение новой спеки':'Сводка Reality'} · {submitted?.actor.name??proposal.agentId} · {spec?.humanId??proposal.specId} / r{sourceRevision?.revision??'?'} · <code>{proposal.executionId}</code></p>
    {spec?.activeRevisionId!==proposal.specRevisionId&&<p className="ws-muted">Анализ прежней ревизии: источники относятся к исходной попытке.</p>}
    <details open={proposal.state==='pending'}><summary>Содержание, источники и рассмотрение</summary>
      <label>Версия предложения<select aria-label={`Версия предложения ${latest.content.title}`} value={shown.id} onChange={event=>setShownId(event.target.value)}>{versions.toReversed().map(revision=><option key={revision.id} value={revision.id}>v{revision.revision}{revision.id===latest.id?' · последняя':' · история'}</option>)}</select></label>
      <p className="ws-muted">Источник: cursor {shown.sourceCursor} · версия проекта сейчас {state.version} · {new Date(shown.createdAt).toLocaleString('ru-RU')}</p>
      <h4>{shown.content.title}</h4><h4>Наблюдения</h4>
      <ol>{shown.content.findings.map((finding,index)=><li key={index}><p>{finding.text}</p>{finding.sourceEventIds.map(id=><SourceFact key={id} id={id} event={state.events.find(event=>event.id===id)}/>)}</li>)}</ol>
      <h4>Интерпретация агента</h4><p>{shown.content.interpretation}</p>
      <h4>Ограничения вывода</h4><p>{shown.content.limitations}</p>
      <p className="ws-muted">Ссылки проверены на принадлежность исполнению. Смысл вывода проверяет человек.</p>
      <details><summary>Все источники предложения · cursor {shown.sourceCursor}</summary>{shown.sourceEventIds.map(id=><SourceFact key={id} id={id} event={state.events.find(event=>event.id===id)}/>)}</details>
      {shown.content.kind==='spec_proposal'&&<section aria-label="Предложенное ожидание"><h4>Предложенная спецификация</h4><strong>{shown.content.draft.title}</strong><p>{shown.content.draft.goal}</p><ul>{shown.content.draft.dod.map(criterion=><li key={criterion.id}>{criterion.text}{!criterion.required&&' · необязательный'}</li>)}</ul>{shown.content.draft.flow&&<FlowPreview flow={shown.content.draft.flow}/>}</section>}
      <ProposalReview proposal={proposal} latest={latest} shown={shown} state={state} command={command} disabled={disabled}/>
    </details>
    {proposal.review&&<section aria-label="Записанное рассмотрение"><h4>{statuses[proposal.state]}</h4><p>Комментарий агенту: {proposal.review.comment}</p><p className="ws-muted">Человек {proposal.review.actorId} · v{versions.find(revision=>revision.id===proposal.review!.revisionId)?.revision??'?'} · {new Date(proposal.review.at).toLocaleString('ru-RU')}</p>{proposal.review.draftSpecId&&<button type="button" onClick={()=>onOpenSpec(proposal.review!.draftSpecId!)}>Открыть созданный черновик</button>}</section>}
  </article>;
}

function SourceFact({id,event}:{id:string;event:DomainEvent|undefined}){
  if(!event)return <p className="ws-error">Источник <code>{id}</code> отсутствует в текущем снимке.</p>;
  const source=event.payload.source as {kind?:string;verificationMethod?:string}|undefined;
  return <details><summary>{sourceNames[event.type]??event.type} · v{event.version} · {event.actor.name??event.actor.id}</summary><code className="ws-path">{event.id}</code>{event.specRevisionId&&<p className="ws-muted">Ревизия <code>{event.specRevisionId}</code></p>}{event.executionId&&<p className="ws-muted">Попытка <code>{event.executionId}</code></p>}{typeof event.payload.title==='string'&&<p>{event.payload.title}</p>}{typeof event.payload.evidence==='string'&&<p className="ws-evidence">{event.payload.evidence}</p>}{event.payload.simulation===true&&<p className="ws-muted">Учебная симуляция</p>}{source?.kind==='github_commit'&&<p className="ws-muted">GitHub · {source.verificationMethod}</p>}<details><summary>Полная исходная запись</summary><pre>{JSON.stringify(event,null,2)}</pre></details></details>;
}

function ProposalReview({proposal,latest,shown,state,command,disabled}:Omit<Props,'onOpenSpec'>&{proposal:AgentProposal;latest:AgentProposalRevision;shown:AgentProposalRevision}){
  const [content,setContent]=useState<RevisionContent|null>(()=>latest.content.kind==='spec_proposal'?structuredClone(latest.content.draft):null);
  const [comment,setComment]=useState(''),[derived,setDerived]=useState(false),[base,setBase]=useState({revisionId:latest.id,version:state.version});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const sending=useRef(false),closed=proposal.state!=='pending',history=shown.id!==latest.id,stale=base.revisionId!==latest.id||base.version!==state.version;
  const readOnly=disabled||busy||closed||history,validDraft=!!content?.title.trim()&&!!content?.goal.trim()&&!!content?.dod.length&&content.dod.every(criterion=>criterion.text.trim());
  const allowed=!readOnly&&!stale&&!!comment.trim();
  const update=(key:Exclude<keyof RevisionContent,'dod'|'flow'>,value:string)=>setContent(current=>current?{...current,[key]:value}:current);
  const run=async(outcome:'adopt'|'reviewed'|'dismissed')=>{
    if(!allowed||sending.current||outcome==='adopt'&&!validDraft)return;
    sending.current=true;setBusy(true);setError('');setNotice('');
    const body={expectedVersion:base.version,proposalId:proposal.id,proposalRevisionId:base.revisionId,comment};
    try{
      const accepted=await command(outcome==='adopt'&&content?{...body,type:'adoptAgentSpecProposal',content:structuredClone(content),...(derived?{sourceSpecId:proposal.specId}:{})}:{...body,type:'reviewAgentProposal',outcome},`proposal:${proposal.id}`,outcome==='adopt'?`Создать черновик: ${content?.title}`:`Рассмотреть предложение: ${latest.content.title}`);
      setNotice(accepted?(outcome==='adopt'?'Черновик создан. Активация и запуск выполняются отдельно.':'Рассмотрение записано.'):'Запись не подтверждена. Проверьте уведомление и блок неподтверждённых действий выше.');
    }catch(e){setError(e instanceof Error?e.message:'Рассмотрение не подтверждено.');}
    finally{sending.current=false;setBusy(false);}
  };
  const submit=(event:FormEvent)=>{event.preventDefault();void run(content?'adopt':'reviewed');};
  return <form className="ws-proposal-review" aria-label={`Рассмотрение предложения ${latest.content.title}`} onSubmit={submit}>
    <h4>{content?'Подготовить черновик спеки':'Рассмотреть сводку'}</h4>
    {history&&<p className="ws-muted">Историческая версия доступна только для чтения. Для решения выберите последнюю версию.</p>}
    {!closed&&stale&&<div className="ws-revision-notice"><p>Появились новые события или версия предложения. Ваш текст сохранён; проверьте изменения перед записью.</p><button type="button" disabled={disabled||busy||history} onClick={()=>{setBase({revisionId:latest.id,version:state.version});setError('');setNotice('');}}>Проверил изменения — обновить основу, сохранив мой текст</button></div>}
    {closed&&<p className="ws-muted">Предложение уже рассмотрено. Введённый текст сохранён для чтения и копирования.</p>}
    {content&&<>
      {!closed&&<button type="button" disabled={readOnly} onClick={()=>{if(latest.content.kind==='spec_proposal')setContent(structuredClone(latest.content.draft));}}>Взять поля последней версии предложения</button>}
      <label>Название новой спеки<input aria-label="Название новой спеки" required maxLength={20000} value={content.title} readOnly={readOnly} onChange={event=>update('title',event.target.value)}/></label>
      <label>Цель новой спеки<textarea aria-label="Цель новой спеки" required rows={3} maxLength={20000} value={content.goal} readOnly={readOnly} onChange={event=>update('goal',event.target.value)}/></label>
      <fieldset disabled={readOnly}><legend>Критерии DoD</legend>{content.dod.map((criterion,index)=><div key={criterion.id}><label>Критерий {index+1}<textarea aria-label={`Критерий новой спеки ${index+1}`} required rows={2} maxLength={20000} value={criterion.text} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(item=>item.id===criterion.id?{...item,text:event.target.value}:item)}:current)}/></label><label className="ws-check"><input type="checkbox" checked={criterion.required} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(item=>item.id===criterion.id?{...item,required:event.target.checked}:item)}:current)}/>Обязательный критерий</label><button type="button" aria-label={`Удалить критерий ${index+1}`} disabled={content.dod.length<=1} onClick={()=>setContent(current=>current?{...current,dod:current.dod.filter(item=>item.id!==criterion.id)}:current)}>Удалить критерий</button></div>)}<button type="button" disabled={content.dod.length>=50} onClick={()=>setContent(current=>current?{...current,dod:[...current.dod,{id:crypto.randomUUID(),text:'',required:true}]}:current)}>Добавить критерий</button></fieldset>
      <details><summary>Остальные поля черновика</summary>{([['constraints','Ограничения'],['assumptions','Допущения'],['risks','Риски'],['inputs','Входные данные'],['comment','Комментарий к новой спеке']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={2} maxLength={20000} value={content[key]} readOnly={readOnly} onChange={event=>update(key,event.target.value)}/></label>)}</details>
      {content.flow&&<details><summary>Процесс, который сохранится в моём черновике</summary><FlowPreview flow={content.flow}/></details>}
      <p className="ws-muted">Процесс сохраняется в черновике. Создание спеки не активирует ревизию и не назначает исполнение.</p>
      <label className="ws-check"><input type="checkbox" checked={derived} disabled={readOnly} onChange={event=>setDerived(event.target.checked)}/>Добавить связь происхождения с исходной спекой</label>
    </>}
    <label>Комментарий агенту<textarea aria-label="Комментарий агенту" required rows={2} maxLength={20000} value={comment} readOnly={readOnly} onChange={event=>setComment(event.target.value)}/></label>
    <p className="ws-muted">Комментарий будет виден агенту исходной попытки. Поля новой спеки принадлежат новому черновику.</p>
    {error&&<p role="alert" className="ws-error">{error}</p>}{notice&&<p role="status" className="ws-muted">{notice}</p>}
    {!closed&&<div className="ws-actions"><button type="submit" className="ws-primary" disabled={!allowed||!!content&&!validDraft}>{busy?'Записываем…':content?'Создать черновик спеки':'Отметить рассмотренным'}</button><button type="button" disabled={!allowed} onClick={()=>void run('dismissed')}>Отклонить предложение</button></div>}
  </form>;
}

function FlowPreview({flow}:{flow:FlowDefinition}){
  const {nodes,edges}=useMemo(()=>{
    const layout=new dagre.graphlib.Graph().setGraph({rankdir:'LR',nodesep:28,ranksep:65}).setDefaultEdgeLabel(()=>({}));
    flow.nodes.forEach(node=>layout.setNode(node.id,{width:210,height:80}));flow.edges.forEach(edge=>layout.setEdge(edge.source,edge.target));dagre.layout(layout);
    const nodes:Node[]=flow.nodes.map(node=>{const place=layout.node(node.id);return {id:node.id,position:{x:place.x-105,y:place.y-40},data:{label:<><small>{ownerNames[node.owner]} · {node.kind}</small><div>{node.title}</div></>},style:{width:210,minHeight:80,background:'var(--bg)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:7}};});
    const edges:Edge[]=flow.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,label:edge.label,markerEnd:{type:MarkerType.ArrowClosed,color:'var(--graph-edge)'},style:{stroke:'var(--graph-edge)'},labelStyle:{fill:'var(--text-muted)',fontSize:11},labelBgStyle:{fill:'var(--bg)'}}));
    return {nodes,edges};
  },[flow]);
  return <section className="ws-proposal-flow" aria-label="Предложенная блок-схема"><h4>Предложенная блок-схема</h4><p className="ws-muted">Возможный процесс из предложения. Фактов исполнения здесь нет.</p><div style={{height:300,minWidth:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={.2} maxZoom={1.6}><Background color="var(--graph-dot)" gap={18}/><Controls showInteractive={false}/></ReactFlow></div><details><summary>Шаги и переходы процесса</summary><ol>{flow.nodes.map(node=><li key={node.id}><strong>{node.title}</strong> · {ownerNames[node.owner]} · {node.kind}{node.id===flow.entryNodeId&&' · вход'}<p>{node.description}</p><ul>{flow.edges.filter(edge=>edge.source===node.id).map(edge=><li key={edge.id}>{edge.label||'Переход'} → {flow.nodes.find(target=>target.id===edge.target)?.title??edge.target}{edge.optionId&&` · вариант ${edge.optionId}`}</li>)}</ul></li>)}</ol></details></section>;
}
