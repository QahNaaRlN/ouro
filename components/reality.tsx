'use client';
import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { DomainEvent } from '@/packages/core/src/types';

const titles: Record<string,string> = {
  SpecCreated:'Спека создана', RevisionProposed:'Предложена ревизия', RevisionActivated:'Ревизия активирована',
  ExecutionCreated:'Попытка разрешена',ExecutionResumed:'Продолжение подтверждено',ExecutionStarted:'Исполнение начато',
  DecisionRequested:'Запрос человеку',DecisionResolved:'Решение человека',DecisionDeferred:'Решение отложено',
  DecisionSuperseded:'Запрос замещён',ResumeAuthorized:'Продолжение разрешено',DecisionApplied:'Применение подтверждено',
  BlockerCleared:'Блокер устранён',ExecutionCompleted:'Попытка завершена',StopRequested:'Остановка запрошена',
  ExecutionPaused:'Остановка подтверждена',ExecutionCancelled:'Попытка отменена',SpecAccepted:'DoD принят человеком',
  ActionReported:'Факт действия',SpecInvalidated:'Спека неактуальна',
};
export function RealityGraph({events}: {events:DomainEvent[]}) {
  const {nodes,edges}=useMemo(()=>{
    const layout=new dagre.graphlib.Graph().setDefaultEdgeLabel(()=>({}));
    layout.setGraph({rankdir:'LR',ranksep:64,nodesep:28,marginx:24,marginy:24});
    const ids=new Set(events.map(e=>e.id));
    for(const event of events) layout.setNode(event.id,{width:230,height:98});
    const links=events.filter(e=>e.causationId && ids.has(e.causationId));
    for(const event of links) layout.setEdge(event.causationId!,event.id);
    dagre.layout(layout);
    const nodes: Node[]=events.map(event=>{
      const p=layout.node(event.id);
      const title=titles[event.type]??event.type;
      return {id:event.id,position:{x:p.x-115,y:p.y-49},data:{label:<div style={{textAlign:'left',padding:4}}><span style={{fontSize:11,color:'var(--muted-foreground)'}}>#{event.version} · {event.actor.kind==='human'?'Человек':event.actor.kind==='agent'?'Агент':'Система'}</span><strong style={{display:'block',margin:'7px 0',fontSize:13}}>{title}</strong><span style={{fontSize:11,color:'var(--muted-foreground)'}}>{new Date(event.occurredAt).toLocaleTimeString('ru-RU')}</span></div>},
        ariaLabel:`Событие ${event.version}: ${title}`,style:{width:230,height:98,background:'var(--subtle, #181a1e)',color:'var(--foreground,#fafafa)',border:'1px solid var(--border,#343841)',borderRadius:6}};
    });
    const edges: Edge[]=links.map(e=>({id:`cause-${e.id}`,source:e.causationId!,target:e.id,type:'smoothstep',label:'основание',markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:'#7c828e'},labelStyle:{fontSize:10,fill:'#b4b8c2'},labelBgStyle:{fill:'#181a1e'}}));
    return {nodes,edges};
  },[events]);
  return <section aria-label="Причинный граф событий" style={{height:420,border:'1px solid var(--border)',borderRadius:6,overflow:'hidden'}}>
    {events.length ? <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false}><Background gap={24} color="#343841"/><Controls showInteractive={false}/></ReactFlow> : <p>Событий пока нет.</p>}
  </section>;
}
