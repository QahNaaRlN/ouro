'use client';
import {graphPresentation,graphControlsClassName,graphHandlePresentation} from '@/packages/frontend/src/shared/ui/graph';
import {useWorkspaceAppearance} from './workspace-ui';


import {WorkspaceAccordion} from './workspace-ui';
import {AppSelect} from './app-select';
import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Node, type NodeProps, type Edge } from '@xyflow/react';
import { ArrowRight, Check, CircleDot, GitBranch, Info, List, Network } from 'lucide-react';
import type { ProjectState } from '@/packages/core/src';
import { buildStateView, STATE_MODELS, type StateAxis, type StateDescription } from '@/packages/core/src/state-view';
import {twMerge} from 'tailwind-merge';
import {statePresentation as ui,stateCardClassName,stateEdgeClassName} from './state-presentation';

type StateNodeData = { state:StateDescription; current:boolean; visited:boolean; selected:boolean; onPick:(id:string)=>void };
type StateNode = Node<StateNodeData,'status'>;
function StateNodeCard({data}:NodeProps<StateNode>) {
  return <>
    {(['source','target'] as const).flatMap(type=>Object.entries({left:Position.Left,right:Position.Right,top:Position.Top,bottom:Position.Bottom}).map(([side,position])=><Handle className={graphHandlePresentation.state} key={`${type}-${side}`} id={`${type}-${side}`} type={type} position={position} isConnectable={false}/>))}
    <button type="button" className={twMerge(`state-node-card ${data.current?'is-current':''} ${data.selected?'is-selected':''} ${data.state.reserved?'is-reserved':''}`,stateCardClassName(data.current,data.selected,!!data.state.reserved))} onClick={()=>data.onPick(data.state.id)} aria-pressed={data.selected} aria-label={`${data.state.label}${data.current?', текущее состояние':''}${data.state.reserved?', зарезервировано':''}`}>
      <span className={twMerge('state-node-marker',ui.marker,data.current&&ui.currentDetails)}>{data.current?<CircleDot size={17}/>:data.visited?<Check size={15}/>:<span className={ui.markerDot}/>}</span>
      <strong className={ui.cardTitle}>{data.state.label}</strong>
      <span className={twMerge('state-node-caption',ui.caption,data.current&&ui.currentDetails)}>{data.current?'Текущее состояние':data.state.reserved?'Зарезервировано':data.visited?'Есть в истории':data.state.terminal?'Конечное состояние':'Возможное состояние'}</span>
    </button>
  </>;
}
const nodeTypes={status:StateNodeCard};
const axes:StateAxis[]=['execution','spec','request','roadmap'];
const actorLabels={human:'Человек',agent:'Агент',system:'Система',mixed:'Человек / система'};
type PortSide = 'left'|'right'|'top'|'bottom';
// Ports keep long transitions outside intermediate state cards. Geometry is presentation only.
const routedPorts:Partial<Record<StateAxis,Record<string,[PortSide,PortSide]>>> = {
  execution:{'running:succeeded':['top','top'],'queued:paused':['bottom','top'],'queued:cancelled':['bottom','bottom'],'waiting_for_human:running':['left','top'],'paused:running':['left','bottom'],'queued:failed':['top','top'],'waiting_for_human:paused':['left','left'],'queued:skipped':['bottom','left']},
  spec:{'idea:invalidated':['bottom','bottom'],'specified:invalidated':['bottom','bottom'],'in_progress:specified':['left','top'],'blocked:specified':['left','bottom'],'done:specified':['top','top'],'in_progress:blocked':['right','right'],'blocked:in_progress':['left','left'],'done:in_progress':['left','right'],'done:blocked':['left','right'],'done:invalidated':['right','right']},
  roadmap:{'draft:archived':['top','top'],'active:archived':['top','top'],'frozen:active':['left','bottom']},
};
const positions:Record<StateAxis,Record<string,{x:number;y:number}>>={
  execution:{queued:{x:24,y:150},running:{x:310,y:150},waiting_for_human:{x:610,y:24},paused:{x:610,y:280},succeeded:{x:930,y:24},failed:{x:930,y:150},cancelled:{x:930,y:280},skipped:{x:310,y:405}},
  spec:{idea:{x:24,y:160},specified:{x:310,y:160},in_progress:{x:610,y:24},blocked:{x:610,y:280},done:{x:930,y:24},invalidated:{x:930,y:280}},
  request:{pending:{x:24,y:160},resolved:{x:380,y:24},superseded:{x:380,y:280},withdrawn:{x:760,y:160}},
  roadmap:{draft:{x:24,y:24},active:{x:310,y:24},frozen:{x:610,y:160},archived:{x:930,y:24}},
};

export function StateTransitions({state,specId,executionId}:{state:ProjectState;specId?:string|null;executionId?:string}) {
  const workspace=useWorkspaceAppearance();
  const executions=useMemo(()=>state.executions.filter(e=>!specId||e.specId===specId),[state.executions,specId]);
  const [axis,setAxis]=useState<StateAxis>(executionId||executions.length?'execution':specId?'spec':'roadmap');
  const [chosenExecution,setChosenExecution]=useState<string|undefined>(executionId);
  const [chosenRequest,setChosenRequest]=useState<string|undefined>();
  const [selected,setSelected]=useState<string|null>(null);
  const [mode,setMode]=useState<'graph'|'list'>('graph');
  const [showAll,setShowAll]=useState(false);
  const actualExecution=executions.find(e=>e.id===(chosenExecution??executionId))??executions.at(-1);
  const requests=state.requests.filter(r=>!specId||r.specId===specId);
  const actualRequest=requests.find(r=>r.id===chosenRequest)??requests.at(-1);
  const view=useMemo(()=>buildStateView(state,{axis,specId,executionId:actualExecution?.id,requestId:actualRequest?.id}),[state,axis,specId,actualExecution?.id,actualRequest?.id]);
  const selection=selected&&view.states.some(s=>s.id===selected)?selected:view.current;
  const detail=view.states.find(s=>s.id===selection);
  const label=(id:string|null)=>view.states.find(s=>s.id===id)?.label??'Создано';
  const observed=new Set(view.history.filter(h=>h.from!==null).map(h=>`${h.from}:${h.to}`));
  const visited=new Set(view.history.map(h=>h.to));
  const nodes:StateNode[]=view.states.map(s=>({id:s.id,type:'status',className:ui.outerNode,position:positions[axis][s.id],width:206,height:92,data:{state:s,current:s.id===view.current,visited:visited.has(s.id),selected:s.id===selection,onPick:setSelected},ariaLabel:`${s.label}${s.id===view.current?', текущее состояние':''}`,focusable:false}));
  const visibleTransitions=view.transitions.filter(t=>showAll||observed.has(t.id)||t.from===selection);
  const edges:Edge[]=visibleTransitions.map(t=>{const [sourcePort,targetPort]=routedPorts[axis]?.[t.id]??['right','left'];return {id:t.id,source:t.from,target:t.to,sourceHandle:`source-${sourcePort}`,targetHandle:`target-${targetPort}`,type:'smoothstep',label:`${t.label.split(' / ')[0]}${observed.has(t.id)?' · факт':''}`,markerEnd:{type:MarkerType.ArrowClosed,width:15,height:15,color:observed.has(t.id)?'var(--positive)':'var(--graph-edge)'},className:stateEdgeClassName(observed.has(t.id)),ariaLabel:`${label(t.from)} → ${label(t.to)}: ${t.label}. ${observed.has(t.id)?'Переход зафиксирован. ':''}${t.guard}`};});
  const key=`${axis}:${view.entityId??'empty'}`;
  return <section className={twMerge("state-transitions",ui.root)} aria-label="Визуальные переходы состояний">
    <div className={twMerge("state-view-heading",ui.heading)}><div><div className="eyebrow">СОСТОЯНИЯ И ПРАВИЛА</div><h3 className={twMerge(ui.title)}><GitBranch size={17}/>Переходы состояний</h3><p className={twMerge(ui.description)}>Подтверждённое состояние и возможные пути. Выбор узла открывает объяснение.</p></div><div className="segmented"><button type="button" className={mode==='graph'?'selected':''} onClick={()=>setMode('graph')}><Network size={14}/>Граф</button><button type="button" className={mode==='list'?'selected':''} onClick={()=>setMode('list')}><List size={14}/>Список</button></div></div>
    <div className={twMerge("state-axis-tabs",ui.axes)} aria-label="Статусная ось">{axes.map(a=><button key={a} type="button" aria-pressed={axis===a} className={twMerge(axis===a?'selected':'',ui.axis,axis===a&&ui.selectedAxis)} onClick={()=>{setAxis(a);setSelected(null);}}>{STATE_MODELS[a].title}</button>)}</div>
    <div className={twMerge("state-view-context",ui.context)}>
      <div className={twMerge("state-current-label",ui.current)}><CircleDot className={twMerge(ui.currentIcon)} size={15}/><span>{view.current?<>Сейчас: <strong className={twMerge(ui.currentValue)}>{label(view.current)}</strong></>:'В выбранном контексте ещё нет этой сущности'}</span></div>
      {axis==='execution'&&executions.length>0&&<label className={twMerge("state-entity-picker",ui.picker)}>Попытка<AppSelect className="min-w-0 max-w-full flex-1 px-[8px] py-[6px] text-[12px]" aria-label="Попытка на диаграмме состояний" value={actualExecution?.id??''} onValueChange={selectedValue=>{setChosenExecution(selectedValue);setSelected(null);}}>{executions.map((e,i)=><option value={e.id} key={e.id}>{e.kind==='remediation'?'Устранение':'Основная'} · {i+1} · {e.id.slice(0,8)}</option>)}</AppSelect></label>}
      {axis==='request'&&requests.length>0&&<label className={twMerge("state-entity-picker",ui.picker)}>Запрос<AppSelect className="min-w-0 max-w-full flex-1 px-[8px] py-[6px] text-[12px]" aria-label="Запрос на диаграмме состояний" value={actualRequest?.id??''} onValueChange={selectedValue=>{setChosenRequest(selectedValue);setSelected(null);}}>{requests.map(r=><option value={r.id} key={r.id}>{r.kind} · {r.title}</option>)}</AppSelect></label>}
    </div>
    {view.notices.length>0&&<div className={twMerge("state-view-notices",ui.notices)} aria-live="polite">{view.notices.map(n=><p className={twMerge(ui.notice)} key={n.code}><Info className={twMerge(ui.noticeIcon)} size={14}/>{n.text}</p>)}</div>}
    {mode==='graph'&&<div className={twMerge("state-graph-options",ui.options)}><p className={twMerge(ui.optionsText)}>{showAll?'Все возможные переходы; условия доступны в объяснении состояния.':'Показаны факты и возможные выходы выбранного состояния.'}</p><button type="button" className={twMerge(showAll?'selected':'',ui.optionsButton,showAll&&ui.optionsSelected)} aria-pressed={showAll} onClick={()=>setShowAll(value=>!value)}>Все возможные переходы</button></div>}
    {mode==='graph'?<div className={twMerge("state-graph-canvas",ui.canvas)} aria-label={`Граф состояний: ${view.title}`}><ReactFlow<StateNode,Edge> className={graphPresentation.attribution} key={key} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:0.12,maxZoom:0.9}} minZoom={0.3} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesFocusable deleteKeyCode={null} ariaLabelConfig={{'controls.zoomIn.ariaLabel':'Приблизить состояния','controls.zoomOut.ariaLabel':'Отдалить состояния','controls.fitView.ariaLabel':'Показать все состояния'}}><Background gap={24} color="var(--graph-dot)"/><Controls className={graphControlsClassName(workspace?'workspace':'legacy','state')} showInteractive={false}/></ReactFlow></div>:<div className={twMerge("state-view-table-wrap",ui.tableWrap)}><table className={twMerge("state-view-table",ui.table)}><caption className={twMerge(ui.tableCaption)}>Состояния оси «{view.title}»</caption><thead><tr><th className={twMerge(ui.cell,ui.header)}>Состояние</th><th className={twMerge(ui.cell,ui.header)}>Смысл</th><th className={twMerge(ui.cell,ui.header)}>Подтверждение</th></tr></thead><tbody>{view.states.map((s,index)=><tr key={s.id} className={twMerge(s.id===view.current?'is-current':'',s.id===view.current&&ui.currentRow)}><td className={twMerge(ui.cell,index===view.states.length-1&&ui.finalRowCell)}><button type="button" className={twMerge("text-btn",ui.tableButton)} onClick={()=>setSelected(s.id)}>{s.label}</button></td><td className={twMerge(ui.cell,index===view.states.length-1&&ui.finalRowCell)}>{s.description}</td><td className={twMerge(ui.cell,index===view.states.length-1&&ui.finalRowCell,ui.finalCell)}>{s.id===view.current?'Текущее':s.reserved?'Зарезервировано':visited.has(s.id)?'Есть в истории':'Возможное'}</td></tr>)}</tbody></table></div>}
    <div className={twMerge("state-graph-legend",ui.legend)}><span className={twMerge(ui.legendItem)}><i className={twMerge("state-legend-current",ui.legendLine,ui.legendCurrent)}/>Текущее состояние</span><span className={twMerge(ui.legendItem)}><i className={twMerge("state-legend-observed",ui.legendLine,ui.legendObserved)}/>Зафиксированный переход</span><span className={twMerge(ui.legendItem)}><i className={twMerge("state-legend-possible",ui.legendLine,ui.legendPossible)}/>Возможный переход с условиями</span></div>
    {detail&&<div className={twMerge("state-detail",ui.detail)} aria-label="Объяснение выбранного состояния"><div><span className="quiet-label">{detail.id===view.current?'ТЕКУЩЕЕ СОСТОЯНИЕ':'ВЫБРАННОЕ СОСТОЯНИЕ'}</span><h4 className={twMerge(ui.detailTitle)}>{detail.label}</h4><p className={twMerge(ui.detailText)}>{detail.description}</p></div><div className={twMerge("state-detail-transitions",ui.transitions)}><h4 className={twMerge(ui.detailTitle)}>Возможные выходы</h4>{view.transitions.filter(t=>t.from===detail.id).length?view.transitions.filter(t=>t.from===detail.id).map((t,index)=><div className={twMerge("state-possible-transition",index>0&&ui.subsequent)} key={t.id}><strong className={twMerge(ui.transitionTitle)}>{label(t.from)} <ArrowRight size={12}/> {label(t.to)}</strong><span className={twMerge(ui.transitionActor)}>{actorLabels[t.actor]} · {t.label}</span><p className={twMerge(ui.detailText)}>{t.guard}</p></div>):<p className={twMerge("helper-note",ui.detailText)}>{detail.reserved?'Операция для этого состояния пока не реализована.':'В этой версии исходящих переходов нет.'}</p>}</div></div>}
    <WorkspaceAccordion className={twMerge("state-transition-history",ui.history)} triggerClassName="text-[12px] leading-[inherit]" title={<>Зафиксированные переходы <span className={twMerge(ui.historyCount)}>{view.history.length}</span></>}>{view.history.length?<ol className={twMerge(ui.historyList)}>{view.history.map(h=><li className={twMerge(ui.historyItem)} key={h.eventId}><span className="mono">#{h.version}</span><strong className={twMerge(ui.historyTitle)}>{label(h.from)} <ArrowRight size={12}/> {label(h.to)}</strong><span>{actorLabels[h.actor.kind==='service'?'system':h.actor.kind]} · {h.eventType}</span></li>)}</ol>:<p className="helper-note">Изменений состояния в этом контексте ещё нет. Пунктирная связь не означает произошедший переход.</p>}</WorkspaceAccordion>
  </section>;
}
