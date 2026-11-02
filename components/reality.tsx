'use client';
import { useMemo,useRef,useState,type ReactNode } from 'react';
import { ReactFlow, Background, MiniMap,MarkerType, type Node, type Edge,type ReactFlowInstance } from '@xyflow/react';
import type { DomainEvent } from '@/packages/core/src/types';
import {runtimeEventNames} from './flow-runtime-ui';
import {buildRealityGraph} from '@/lib/workspace-graph';
import {InitialGraphViewportFit,useGraphMeasurements,WorkspaceGraphControls} from './workspace-graph-controls';
import './workspace-graphs.css';

const titles: Record<string,string> = {
  ...runtimeEventNames,
  AgentProposalSubmitted:'Предложение агента',AgentProposalRevisionSubmitted:'Уточнение предложения',AgentProposalReviewed:'Сводка рассмотрена',AgentProposalDismissed:'Предложение отклонено',AgentProposalAdopted:'Создан черновик из предложения',
  GitHubBindingCreated:'Привязан репозиторий GitHub',GitHubBindingRevoked:'Отозвана привязка GitHub',
  LessonCreated:'Черновик урока создан',LessonRevisionProposed:'Предложена редакция урока',LessonPublished:'Урок опубликован',
  SpecCreated:'Спека создана', RevisionProposed:'Предложена ревизия', RevisionActivated:'Ревизия активирована',
  ExecutionCreated:'Попытка разрешена',ExecutionResumed:'Продолжение подтверждено',ExecutionStarted:'Исполнение начато',
  DecisionRequested:'Запрос человеку',DecisionResolved:'Решение человека',DecisionDeferred:'Решение отложено',
  DecisionWithdrawn:'Запрос отозван автором',DecisionClarificationRequested:'Человек запросил уточнение',DecisionClarificationSubmitted:'Уточнение агента',
  ExecutionOperatorCancelled:'Авторизация отозванного агента отменена',ExternalStopAttested:'Свидетельство оператора об остановке',
  DecisionSuperseded:'Запрос замещён',ResumeAuthorized:'Продолжение разрешено',DecisionApplied:'Применение подтверждено',
  BlockerApplicabilityEnded:'Применимость прежнего блокера завершена',BlockerCleared:'Блокер устранён',ExecutionCompleted:'Попытка завершена',StopRequested:'Остановка запрошена',
  ExecutionPaused:'Остановка подтверждена',ExecutionCancelled:'Попытка отменена',SpecAccepted:'DoD принят человеком',
  ActionReported:'Факт действия',SpecInvalidated:'Спека неактуальна',DependencyAdded:'Зависимость добавлена',RoadmapStateChanged:'Состояние карты изменено',
};
type RealityNode=Node<{label:ReactNode;eventId:string}>;
const realityFitOptions={padding:0.14,minZoom:0.01,maxZoom:0.95};
export function RealityGraph({events,onSelectEvent,selectedEventId,scopeLabel,active=true,fitKey=''}: {events:DomainEvent[];onSelectEvent?:(eventId:string)=>void;selectedEventId?:string;scopeLabel?:string;active?:boolean;fitKey?:string}) {
  const containerRef=useRef<HTMLElement>(null);
  const [flowInstance,setFlowInstance]=useState<ReactFlowInstance<RealityNode,Edge>|null>(null);
  const measurements=useGraphMeasurements<RealityNode>();
  const {nodes,edges}=useMemo(()=>{
    const graph=buildRealityGraph(events);
    const nodes: RealityNode[]=graph.nodes.map(({event,position})=>{
      const title=titles[event.type]??event.type;
      return {id:event.id,position,measured:measurements.measured[event.id],selected:event.id===selectedEventId,data:{eventId:event.id,label:<div style={{textAlign:'left',padding:4}}><span style={{fontSize:12,color:'var(--text-muted)'}}>#{event.version} · {event.actor.kind==='human'?'Человек':event.actor.kind==='agent'?'Агент':'Система'}</span><strong style={{display:'block',margin:'7px 0',fontSize:14}}>{title}</strong><span style={{fontSize:12,color:'var(--text-muted)'}}>{new Date(event.occurredAt).toLocaleTimeString('ru-RU')}</span></div>},
        ariaLabel:`Событие ${event.version}: ${title}`,style:{width:230,height:98,background:'var(--subtle)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:6}};
    });
    const edges: Edge[]=graph.edges.map(edge=>({...edge,type:'smoothstep',label:'основание',markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:'var(--graph-edge)'},labelStyle:{fontSize:10,fill:'var(--text-muted)'},labelBgStyle:{fill:'var(--bg)'}}));
    return {nodes,edges};
  },[events,selectedEventId,measurements.measured]);
  return <section ref={containerRef} aria-label={scopeLabel??'Причинный граф событий'} className="workspace-graph workspace-reality" onKeyDownCapture={event=>{
    if(!onSelectEvent||(event.key!=='Enter'&&event.key!==' ')||event.repeat)return;
    const target=event.target;if(!(target instanceof HTMLElement)||!target.classList.contains('react-flow__node'))return;
    const id=target.getAttribute('data-id');if(!id)return;event.preventDefault();event.stopPropagation();onSelectEvent(id);
  }}>
    {events.length ? <ReactFlow<RealityNode,Edge> nodes={nodes} edges={edges} onInit={setFlowInstance} onNodesChange={measurements.onChanges} onNodeClick={(_,node)=>onSelectEvent?.(node.data.eventId)} nodesFocusable={!!onSelectEvent} fitViewOptions={realityFitOptions} minZoom={0.01} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={{'controls.zoomIn.ariaLabel':'Приблизить события','controls.zoomOut.ariaLabel':'Отдалить события','controls.fitView.ariaLabel':'Вписать события','node.a11yDescription.default':onSelectEvent?'Нажмите Enter или пробел, чтобы открыть исходное событие.':'Сохранённое событие проекта.'}}><Background gap={24} color="var(--graph-dot)"/><InitialGraphViewportFit active={active} containerRef={containerRef} instance={flowInstance} fitOptions={realityFitOptions} fitKey={fitKey}/><WorkspaceGraphControls containerRef={containerRef} fitOptions={realityFitOptions}/><MiniMap nodeColor="var(--selected)" maskColor="var(--minimap-mask)" pannable zoomable/></ReactFlow> : <p className="workspace-reality-empty">Событий пока нет.</p>}
  </section>;
}
