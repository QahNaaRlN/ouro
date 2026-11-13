'use client';
import {graphPresentation,graphControlsClassName,graphHandlePresentation} from '@/packages/frontend/src/shared/ui/graph';

import {twMerge} from 'tailwind-merge';
import {workspacePresentation as ui} from './workspace-presentation';
import {flowPreviewPresentation as previewUi} from './flow-preview-presentation';

import {useMemo,useRef,useState,type FormEvent} from 'react';
import {Background,Controls,MarkerType,ReactFlow,type Edge,type Node} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type {AgentProposal,AgentProposalRevision,DomainEvent,FlowDefinition,ProjectState,RevisionContent} from '@/packages/core/src';
import type {WorkspaceCommand} from './workspace-decisions';
import {WorkspaceAccordion,WorkspaceSelect,WorkspaceTextarea} from './workspace-ui';
import {selectWorkspaceProposals,type WorkspaceProposalScope} from '@/packages/frontend/src/entities/agent-proposal';

/** Оформление элементов этого модуля; общие элементы используют workspacePresentation. */
const presentationSlots={
  proposalPanel:"min-w-0 rounded-[10px] border-solid border-ouro-border at-most-520:rounded-[8px] mb-[22px] border-0 bg-transparent p-0 at-most-520:p-0",
  empty:"rounded-[8px] border border-dashed border-ouro-border px-[20px] py-[28px] m-[8px_0_20px] text-[12px] text-ouro-text-muted",
  proposalRow:"flex items-center justify-between gap-[20px] border-0 border-b border-solid border-ouro-border p-[18px] last:border-b-0 at-most-760:flex-col at-most-760:items-start",
  proposalBadge:"inline-flex rounded-[30px] border border-solid border-ouro-border px-[9px] py-[3px] text-[10px] leading-[1.5] whitespace-normal shrink-0",
  reviewError:"my-[15px] rounded-[7px] border border-solid border-[color:var(--negative)] bg-[var(--negative-surface)] px-[16px] py-[14px] text-[color:var(--negative)] text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]",
} as const;

type Props={state:ProjectState;command:WorkspaceCommand;disabled:boolean;onOpenSpec:(id:string)=>void;proposalId?:string;onOpenProposal?:(id:string)=>void};
const statuses:Record<AgentProposal['state'],string>={pending:'Ожидает рассмотрения',reviewed:'Рассмотрено человеком',dismissed:'Отклонено человеком',adopted:'Создан черновик спеки'};
const sourceNames:Record<string,string>={ActionReported:'Действие агента',ExecutionStarted:'ACK начала',ExecutionResumed:'ACK продолжения',ExecutionPaused:'ACK остановки',ExecutionCompleted:'Результат попытки',DecisionRequested:'Запрос человеку',DecisionResolved:'Решение человека',DecisionApplied:'Подтверждение применения',BlockerCleared:'Устранение блокера',FlowStepStarted:'Начало прохода',FlowStepCompleted:'Результат прохода',FlowStepFailed:'Неуспех прохода',FlowStepSkipped:'Пропуск человеком',FlowStepRetried:'Повтор человеком',FlowEdgeTraversed:'Переход процесса'};
const ownerNames={human:'Человек',agent:'Агент',system:'Система'};

/** Links reuse the existing project-level card and its mounted review draft. */
export function WorkspaceSpecProposals({state,scope,onOpenProposal}:{state:ProjectState;scope:WorkspaceProposalScope;onOpenProposal:(id:string)=>void}){
  const proposals=selectWorkspaceProposals(state,scope),pending=proposals.filter(proposal=>proposal.state==='pending').length;
  return <section className={twMerge("ws-panel",presentationSlots.proposalPanel,"border-none border-current")} aria-label="Предложения выбранной ревизии и попытки">
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><h2 className={twMerge(ui.h2,"mb-0","leading-[1.4]")}>Предложения спеки</h2><span className={twMerge("ws-muted",ui.muted)}>Всего {proposals.length} · ожидают рассмотрения {pending}</span></div>
    <p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>{scope.executionId?'Показаны предложения выбранной ревизии и попытки.':'Показаны предложения всех попыток выбранной ревизии.'} Рассмотрение открывается в полной карточке предложения.</p>
    {!proposals.length&&<p className={twMerge(ui.paragraph,"ws-empty",presentationSlots.empty,ui.paragraph)}>Предложений в выбранной области пока нет.</p>}
    <div className={twMerge("ws-proposal-list","grid gap-0 rounded-[8px] border border-solid border-ouro-border")}>{proposals.map(proposal=>{
      const latest=state.agentProposalRevisions.find(revision=>revision.id===proposal.latestRevisionId&&revision.proposalId===proposal.id),revision=state.revisions.find(revision=>revision.id===proposal.specRevisionId&&revision.specId===proposal.specId);
      const attempt=state.executions.filter(execution=>execution.specId===proposal.specId&&execution.specRevisionId===proposal.specRevisionId).findIndex(execution=>execution.id===proposal.executionId);
      return <article className={presentationSlots.proposalRow} key={proposal.id} data-spec-proposal-id={proposal.id}><div><button className={twMerge(ui.button,"justify-start border-0 bg-transparent p-0 text-left text-[14px]","leading-[1.6]","border-none border-current")} type="button" onClick={()=>onOpenProposal(proposal.id)}>{latest?.content.title??'Версия предложения недоступна'}</button><p className={twMerge(ui.paragraph,"my-[8px] text-[11px] text-ouro-text-muted",ui.paragraph)}>r{revision?.revision??'?'} · попытка {attempt>=0?attempt+1:proposal.executionId} · {latest?'v'+latest.revision:'версия неизвестна'}</p></div><span className={twMerge("ws-badge",presentationSlots.proposalBadge)}>{statuses[proposal.state]}</span></article>;
    })}</div>
  </section>;
}

/** Показывает предложения агентов и связывает их рассмотрение с карточкой предложения и спекой. */
export function WorkspaceProposals({state,command,disabled,onOpenSpec,proposalId,onOpenProposal}:Props){
  return <section className={twMerge("ws-panel",presentationSlots.proposalPanel,"border-none border-current")} aria-label="Предложения агентов">
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><h2 className={twMerge(ui.h2,"mb-0","leading-[1.4]")}>Предложения агентов</h2><span className={twMerge("ws-muted",ui.muted)}>{state.agentProposals.filter(proposal=>proposal.state==='pending').length} ожидают</span></div>
    <p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Агент предлагает сводку или новую спеку с источниками. Человек проверяет выводы и отдельно задаёт ожидание.</p>
    {!state.agentProposals.length&&<p className={twMerge(ui.paragraph,"ws-muted","m-[8px_0_20px] text-[12px] text-ouro-text-muted",ui.paragraph)}>Предложений пока нет. Назначенный MCP-агент может отправить их через ouro.submit_proposal.</p>}
    {onOpenProposal&&!proposalId&&<div className={twMerge("ws-proposal-list","grid gap-0 rounded-[8px] border border-solid border-ouro-border")}>{state.agentProposals.toReversed().map(proposal=>{const revision=state.agentProposalRevisions.find(r=>r.id===proposal.latestRevisionId);return <article className={presentationSlots.proposalRow} key={proposal.id}><div><button className={twMerge(ui.button,"justify-start border-0 bg-transparent p-0 text-left text-[14px]","leading-[1.6]","border-none border-current")} onClick={()=>onOpenProposal(proposal.id)}>{revision?.content.title??'Версия предложения недоступна'}</button><p className={twMerge(ui.paragraph,"my-[8px] text-[11px] text-ouro-text-muted",ui.paragraph)}>{state.specs.find(s=>s.id===proposal.specId)?.humanId??proposal.specId} · {revision?'v'+revision.revision:'версия неизвестна'}</p></div><span className={twMerge("ws-badge",presentationSlots.proposalBadge)}>{statuses[proposal.state]}</span></article>;})}</div>}
    {onOpenProposal&&proposalId&&<button className={twMerge(ui.button,"leading-[1.6]")} onClick={()=>onOpenProposal('')}>← Все предложения</button>}
    {state.agentProposals.toReversed().map(proposal=><div className={"[&[hidden]]:hidden"} key={state.projectId+':'+proposal.id} hidden={!!onOpenProposal&&proposalId!==proposal.id}><ProposalCard proposal={proposal} state={state} command={command} disabled={disabled} onOpenSpec={onOpenSpec}/></div>)}
  </section>;
}

function ProposalCard({proposal,state,command,disabled,onOpenSpec}:Props&{proposal:AgentProposal}){
  const versions=state.agentProposalRevisions.filter(revision=>revision.proposalId===proposal.id);
  const latest=versions.find(revision=>revision.id===proposal.latestRevisionId);
  const [shownId,setShownId]=useState(proposal.latestRevisionId);
  if(!latest)return <article className={twMerge("ws-proposal","min-w-0 border-0 border-t border-solid border-ouro-border py-[20px]")}><p className={twMerge(ui.paragraph,"ws-error",presentationSlots.reviewError,"leading-[1.8]")}>Версия предложения отсутствует в снимке. Перечитайте историю проекта.</p></article>;
  const shown=versions.find(revision=>revision.id===shownId)??latest;
  const spec=state.specs.find(item=>item.id===proposal.specId),sourceRevision=state.revisions.find(revision=>revision.id===proposal.specRevisionId);
  const submitted=state.events.find(event=>event.actor.id===proposal.agentId&&['AgentProposalSubmitted','AgentProposalRevisionSubmitted'].includes(event.type));
  return <article className={twMerge("ws-proposal","min-w-0 border-0 border-t border-solid border-ouro-border py-[20px]")} aria-label={`Предложение: ${latest.content.title}`} data-proposal-id={proposal.id}>
    <div className={twMerge("ws-section-top",ui.sectionHeading)}><h3 className={twMerge(ui.h3,"mb-0 mt-[12px]","leading-[1.5]")}>{latest.content.title}</h3><span className={twMerge("ws-badge",ui.badge)}>{statuses[proposal.state]}</span></div>
    <p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>{latest.content.kind==='spec_proposal'?'Предложение новой спеки':'Сводка Reality'} · {submitted?.actor.name??proposal.agentId} · {spec?.humanId??proposal.specId} / r{sourceRevision?.revision??'?'} · <code className={ui.code}>{proposal.executionId}</code></p>
    {spec?.activeRevisionId!==proposal.specRevisionId&&<p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>Анализ прежней ревизии: источники относятся к исходной попытке.</p>}
    <WorkspaceAccordion defaultOpen={proposal.state==='pending'} title={<>Содержание, источники и рассмотрение</>}>
      <label className={ui.label}>Версия предложения<WorkspaceSelect aria-label={`Версия предложения ${latest.content.title}`} value={shown.id} onValueChange={selectedValue=>setShownId(selectedValue)}>{versions.toReversed().map(revision=><option key={revision.id} value={revision.id}>v{revision.revision}{revision.id===latest.id?' · последняя':' · история'}</option>)}</WorkspaceSelect></label>
      <p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>Источник: cursor {shown.sourceCursor} · версия проекта сейчас {state.version} · {new Date(shown.createdAt).toLocaleString('ru-RU')}</p>
      <h4 className={twMerge(ui.h4,"leading-[1.5]")}>{shown.content.title}</h4><h4 className={twMerge(ui.h4,"leading-[1.5]")}>Наблюдения</h4>
      <ol className={"pl-[20px]"}>{shown.content.findings.map((finding,index)=><li className={"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]"} key={index}><p className={twMerge(ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>{finding.text}</p>{finding.sourceEventIds.map(id=><SourceFact key={id} id={id} event={state.events.find(event=>event.id===id)}/>)}</li>)}</ol>
      <h4 className={twMerge(ui.h4,"leading-[1.5]")}>Интерпретация агента</h4><p className={twMerge(ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>{shown.content.interpretation}</p>
      <h4 className={twMerge(ui.h4,"leading-[1.5]")}>Ограничения вывода</h4><p className={twMerge(ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>{shown.content.limitations}</p>
      <p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>Ссылки проверены на принадлежность исполнению. Смысл вывода проверяет человек.</p>
      <WorkspaceAccordion title={<>Все источники предложения · cursor {shown.sourceCursor}</>}>{shown.sourceEventIds.map(id=><SourceFact key={id} id={id} event={state.events.find(event=>event.id===id)}/>)}</WorkspaceAccordion>
      {shown.content.kind==='spec_proposal'&&<section aria-label="Предложенное ожидание"><h4 className={twMerge(ui.h4,"leading-[1.5]")}>Предложенная спецификация</h4><strong>{shown.content.draft.title}</strong><p className={twMerge(ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>{shown.content.draft.goal}</p><ul className={"pl-[20px]"}>{shown.content.draft.dod.map(criterion=><li className={"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]"} key={criterion.id}>{criterion.text}{!criterion.required&&' · необязательный'}</li>)}</ul>{shown.content.draft.flow&&<FlowPreview flow={shown.content.draft.flow}/>}</section>}
      <ProposalReview proposal={proposal} latest={latest} shown={shown} state={state} command={command} disabled={disabled}/>
    </WorkspaceAccordion>
    {proposal.review&&<section aria-label="Записанное рассмотрение"><h4 className={twMerge(ui.h4,"leading-[1.5]")}>{statuses[proposal.state]}</h4><p className={twMerge(ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>Комментарий агенту: {proposal.review.comment}</p><p className={twMerge(ui.paragraph,"ws-muted","text-ouro-text-muted text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]","leading-[1.8]")}>Человек {proposal.review.actorId} · v{versions.find(revision=>revision.id===proposal.review!.revisionId)?.revision??'?'} · {new Date(proposal.review.at).toLocaleString('ru-RU')}</p>{proposal.review.draftSpecId&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" onClick={()=>onOpenSpec(proposal.review!.draftSpecId!)}>Открыть созданный черновик</button>}</section>}
  </article>;
}

function SourceFact({id,event}:{id:string;event:DomainEvent|undefined}){
  if(!event)return <p className={twMerge(ui.paragraph,"ws-error",ui.error,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Источник <code className={ui.code}>{id}</code> отсутствует в текущем снимке.</p>;
  const source=event.payload.source as {kind?:string;verificationMethod?:string}|undefined;
  return <WorkspaceAccordion title={<>{sourceNames[event.type]??event.type} · v{event.version} · {event.actor.name??event.actor.id}</>}><code className={twMerge(ui.code,"ws-path",ui.path)}>{event.id}</code>{event.specRevisionId&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Ревизия <code className={ui.code}>{event.specRevisionId}</code></p>}{event.executionId&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Попытка <code className={ui.code}>{event.executionId}</code></p>}{typeof event.payload.title==='string'&&<p className={twMerge(ui.paragraph,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>{event.payload.title}</p>}{typeof event.payload.evidence==='string'&&<p className={twMerge(ui.paragraph,"ws-evidence",ui.evidence,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>{event.payload.evidence}</p>}{event.payload.simulation===true&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Учебная симуляция</p>}{source?.kind==='github_commit'&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>GitHub · {source.verificationMethod}</p>}<WorkspaceAccordion title={<>Полная исходная запись</>}><pre className={ui.pre}>{JSON.stringify(event,null,2)}</pre></WorkspaceAccordion></WorkspaceAccordion>;
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
  return <form className={twMerge(ui.form,"ws-proposal-review","mt-[22px] border-0 border-t border-solid border-ouro-border pt-[18px]")} aria-label={`Рассмотрение предложения ${latest.content.title}`} onSubmit={submit}>
    <h4 className={twMerge(ui.h4,"leading-[1.5]")}>{content?'Подготовить черновик спеки':'Рассмотреть сводку'}</h4>
    {history&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Историческая версия доступна только для чтения. Для решения выберите последнюю версию.</p>}
    {!closed&&stale&&<div className={twMerge("ws-revision-notice","my-[20px] rounded-[6px] border border-solid border-[color:var(--attention)] p-[16px]")}><p className={twMerge(ui.paragraph,"text-[12px]",ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Появились новые события или версия предложения. Ваш текст сохранён; проверьте изменения перед записью.</p><button className={twMerge(ui.button,"leading-[1.6]")} type="button" disabled={disabled||busy||history} onClick={()=>{setBase({revisionId:latest.id,version:state.version});setError('');setNotice('');}}>Проверил изменения — обновить основу, сохранив мой текст</button></div>}
    {closed&&<p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Предложение уже рассмотрено. Введённый текст сохранён для чтения и копирования.</p>}
    {content&&<>
      {!closed&&<button className={twMerge(ui.button,"leading-[1.6]")} type="button" disabled={readOnly} onClick={()=>{if(latest.content.kind==='spec_proposal')setContent(structuredClone(latest.content.draft));}}>Взять поля последней версии предложения</button>}
      <label className={ui.label}>Название новой спеки<input className={twMerge(ui.input,"leading-[1.6]")} aria-label="Название новой спеки" required maxLength={20000} value={content.title} readOnly={readOnly} onChange={event=>update('title',event.target.value)}/></label>
      <label className={ui.label}>Цель новой спеки<WorkspaceTextarea aria-label="Цель новой спеки" required rows={3} maxLength={20000} value={content.goal} readOnly={readOnly} onChange={event=>update('goal',event.target.value)}/></label>
      <fieldset className={"m-0 grid min-w-0 gap-[18px] rounded-[6px] border border-solid border-ouro-border p-[14px]"} disabled={readOnly}><legend className={"px-[8px] text-[12px] text-ouro-text-muted"}>Критерии DoD</legend>{content.dod.map((criterion,index)=><div className={"grid gap-[10px]"} key={criterion.id}><label className={ui.label}>Критерий {index+1}<WorkspaceTextarea aria-label={`Критерий новой спеки ${index+1}`} required rows={2} maxLength={20000} value={criterion.text} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(item=>item.id===criterion.id?{...item,text:event.target.value}:item)}:current)}/></label><label className={twMerge(ui.label,"ws-check","flex flex-wrap items-center gap-[8px]")}><input className={twMerge("leading-[1.6]")} type="checkbox" checked={criterion.required} onChange={event=>setContent(current=>current?{...current,dod:current.dod.map(item=>item.id===criterion.id?{...item,required:event.target.checked}:item)}:current)}/>Обязательный критерий</label><button className={twMerge(ui.button,"leading-[1.6]")} type="button" aria-label={`Удалить критерий ${index+1}`} disabled={content.dod.length<=1} onClick={()=>setContent(current=>current?{...current,dod:current.dod.filter(item=>item.id!==criterion.id)}:current)}>Удалить критерий</button></div>)}<button className={twMerge(ui.button,"leading-[1.6]")} type="button" disabled={content.dod.length>=50} onClick={()=>setContent(current=>current?{...current,dod:[...current.dod,{id:crypto.randomUUID(),text:'',required:true}]}:current)}>Добавить критерий</button></fieldset>
      <WorkspaceAccordion title={<>Остальные поля черновика</>}>{([['constraints','Ограничения'],['assumptions','Допущения'],['risks','Риски'],['inputs','Входные данные'],['comment','Комментарий к новой спеке']] as const).map(([key,label])=><label className={ui.label} key={key}>{label}<WorkspaceTextarea rows={2} maxLength={20000} value={content[key]} readOnly={readOnly} onChange={event=>update(key,event.target.value)}/></label>)}</WorkspaceAccordion>
      {content.flow&&<WorkspaceAccordion title={<>Процесс, который сохранится в моём черновике</>}><FlowPreview flow={content.flow}/></WorkspaceAccordion>}
      <p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Процесс сохраняется в черновике. Создание спеки не активирует ревизию и не назначает исполнение.</p>
      <label className={twMerge(ui.label,"ws-check","flex flex-wrap items-center gap-[8px]")}><input className={twMerge("leading-[1.6]")} type="checkbox" checked={derived} disabled={readOnly} onChange={event=>setDerived(event.target.checked)}/>Добавить связь происхождения с исходной спекой</label>
    </>}
    <label className={ui.label}>Комментарий агенту<WorkspaceTextarea aria-label="Комментарий агенту" required rows={2} maxLength={20000} value={comment} readOnly={readOnly} onChange={event=>setComment(event.target.value)}/></label>
    <p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Комментарий будет виден агенту исходной попытки. Поля новой спеки принадлежат новому черновику.</p>
    {error&&<p role="alert" className={twMerge(ui.paragraph,"ws-error",ui.error,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>{error}</p>}{notice&&<p role="status" className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>{notice}</p>}
    {!closed&&<div className={twMerge("ws-actions",ui.actions)}><button type="submit" className={twMerge(ui.button,"ws-primary",ui.primary,"leading-[1.6]")} disabled={!allowed||!!content&&!validDraft}>{busy?'Записываем…':content?'Создать черновик спеки':'Отметить рассмотренным'}</button><button className={twMerge(ui.button,"leading-[1.6]")} type="button" disabled={!allowed} onClick={()=>void run('dismissed')}>Отклонить предложение</button></div>}
  </form>;
}

function FlowPreview({flow}:{flow:FlowDefinition}){
  const {nodes,edges}=useMemo(()=>{
    const layout=new dagre.graphlib.Graph().setGraph({rankdir:'LR',nodesep:28,ranksep:65}).setDefaultEdgeLabel(()=>({}));
    flow.nodes.forEach(node=>layout.setNode(node.id,{width:210,height:80}));flow.edges.forEach(edge=>layout.setEdge(edge.source,edge.target));dagre.layout(layout);
    const nodes:Node[]=flow.nodes.map(node=>{const place=layout.node(node.id);return {id:node.id,position:{x:place.x-105,y:place.y-40},data:{label:<><small>{ownerNames[node.owner]} · {node.kind}</small><div>{node.title}</div></>},className:previewUi.node};});
    const edges:Edge[]=flow.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,label:edge.label,markerEnd:{type:MarkerType.ArrowClosed,color:'var(--graph-edge)'},className:previewUi.edge}));
    return {nodes,edges};
  },[flow]);
  return <section className="ws-proposal-flow" aria-label="Предложенная блок-схема"><h4 className={twMerge(ui.h4,"leading-[1.5]")}>Предложенная блок-схема</h4><p className={twMerge(ui.paragraph,"ws-muted",ui.muted,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>Возможный процесс из предложения. Фактов исполнения здесь нет.</p><div className={twMerge("h-[300px] min-w-0 overflow-hidden rounded-[8px] border border-solid border-ouro-border")} ><ReactFlow className={`${graphPresentation.attribution} ${graphHandlePresentation.defaultNodes}`} nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={.2} maxZoom={1.6}><Background color="var(--graph-dot)" gap={18}/><Controls className={graphControlsClassName('workspace','default')} showInteractive={false}/></ReactFlow></div><WorkspaceAccordion title={<>Шаги и переходы процесса</>}><ol className={twMerge("pl-[20px]")}>{flow.nodes.map(node=><li className={twMerge("text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")} key={node.id}><strong>{node.title}</strong> · {ownerNames[node.owner]} · {node.kind}{node.id===flow.entryNodeId&&' · вход'}<p className={twMerge(ui.paragraph,ui.paragraph,"text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")}>{node.description}</p><ul className={twMerge("pl-[20px]")}>{flow.edges.filter(edge=>edge.source===node.id).map(edge=><li className={twMerge("text-[12px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:break-word]")} key={edge.id}>{edge.label||'Переход'} → {flow.nodes.find(target=>target.id===edge.target)?.title??edge.target}{edge.optionId&&` · вариант ${edge.optionId}`}</li>)}</ul></li>)}</ol></WorkspaceAccordion></section>;
}
