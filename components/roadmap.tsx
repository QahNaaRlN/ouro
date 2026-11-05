"use client";
import {verificationPairWorkspacePresentation,VerificationPairCard,WorkStatus} from '@/packages/frontend/src/entities/work';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  ArrowUpRight,
  GitBranch,
  CircleHelp,
} from "lucide-react";
import type { ProjectState, Spec, SpecState } from "@/packages/core/src";
import {getWorkPairGroups,getWorkPairPresentation,type WorkPairGroup} from '@/packages/core/src';
import {getCanonicalStatusPresentation,getSpecWorkPresentation} from '@/packages/core/src/work-presentation';
import {twMerge} from 'tailwind-merge';
import {useWorkspaceAppearance} from './workspace-ui';
import {graphPresentation,graphHandlePresentation} from '@/packages/frontend/src/shared/ui/graph';
import {roadmapPresentation as ui} from './roadmap-presentation';
import {InitialGraphViewportFit,useGraphMeasurements,WorkspaceGraphControls} from './workspace-graph-controls';
import {isExecutingDependency,layoutRoadmap,ROADMAP_FIT_OPTIONS,ROADMAP_MIN_ZOOM,ROADMAP_NODE_HEIGHT,ROADMAP_NODE_WIDTH} from '@/lib/workspace-graph';

export const specLabels: Record<SpecState, string> = {
  idea: "Идея",
  specified: "Специфицировано",
  in_progress: "В работе",
  blocked: "Заблокировано",
  done: "Принято",
  invalidated: "Неактуально",
};
export function Status({ state }: { state: string }) {
  return <WorkStatus presentation={getCanonicalStatusPresentation(state)}/>;
}

type CardData = {
  state:ProjectState;
  group:WorkPairGroup;
  openLayer:(specId:string,revisionId:string)=>void;
  spec: Spec;
  revision: number;
  selected: boolean;
  goal: string;
  presentation:ReturnType<typeof getSpecWorkPresentation>;
  proposalCount:number;
  openRequests?: (id:string,revisionId?:string)=>void;
  openProposals?: (id:string,revisionId?:string)=>void;
};
type SpecFlowNode = Node<CardData, "spec">;
function SpecNode({ data }: NodeProps<SpecFlowNode>) {
  const workspace=useWorkspaceAppearance();
  if(data.group.verifications.length)return <div className={twMerge(`spec-node verification-graph-node ${data.selected?'is-selected':''}`,ui.pair)}><Handle className={graphHandlePresentation.roadmap} type="target" position={Position.Left}/><VerificationPairCard classNames={{...(workspace?verificationPairWorkspacePresentation:{}),face:data.selected?'border-ouro-text-muted':'',button:'max-w-full whitespace-normal [overflow-wrap:anywhere]',attention:twMerge(ui.attention,workspace&&ui.pairWorkspaceAttention),proposals:ui.proposals,updated:ui.updated,time:ui.time}} state={data.state} group={data.group} onOpen={data.openLayer} onOpenRequests={data.openRequests} onOpenProposals={data.openProposals}/><Handle className={graphHandlePresentation.roadmap} type="source" position={Position.Right}/></div>;
  return (
    <div className={twMerge(`spec-node ${data.selected ? "is-selected" : ""}`,ui.card,data.selected&&ui.selected)}>
      <Handle className={graphHandlePresentation.roadmap} type="target" position={Position.Left} />
      <div className={twMerge('node-top',ui.top)}>
        <span className={twMerge('mono',ui.id)}>{data.spec.humanId}</span>
        <ArrowUpRight size={14} />
      </div>
      <div className={twMerge('node-title',ui.title)} title={data.spec.title}>{data.spec.title}</div>
      <p className={twMerge('node-goal',ui.goal,workspace?ui.workspaceGoal:ui.legacyGoal)}>{data.goal}</p>
      <div className={twMerge('node-bottom',ui.bottom)}>
        <WorkStatus className={ui.status} presentation={data.presentation}/>
        <span className={twMerge('node-revision',ui.revision)}>r{data.revision}</span>
      </div>
      {data.presentation.currentRequestCount>0&&(data.openRequests?<button className={twMerge('node-attention nodrag nopan',ui.attention,ui.requestButton,workspace&&ui.workspaceRequestButton)} aria-label={`Вопросы спеки ${data.spec.humanId}`} onClick={event=>{event.stopPropagation();data.openRequests?.(data.spec.id);}}><CircleHelp size={12}/>{data.presentation.currentRequestCount} запросов · открыто {data.presentation.pendingRequestCount}</button>:<div className={twMerge('node-attention',ui.attention)}><CircleHelp size={12}/>{data.presentation.currentRequestCount} запросов · открыто {data.presentation.pendingRequestCount}</div>)}
      {data.proposalCount>0&&(data.openProposals?<button className={twMerge('node-proposals nodrag nopan',ui.proposals,ui.proposalButton)} aria-label={`Предложения спеки ${data.spec.humanId}`} onClick={event=>{event.stopPropagation();data.openProposals?.(data.spec.id);}}>Предложения · {data.proposalCount}</button>:<div className={twMerge('node-proposals',ui.proposals)}>Предложения · {data.proposalCount}</div>)}
      <p className={twMerge('node-updated',ui.updated)}>{data.presentation.lastUpdatedAt?<><span>Обновлено </span><time className={ui.time} dateTime={data.presentation.lastUpdatedAt} aria-label={`Последнее событие ${data.spec.humanId}`}>{new Date(data.presentation.lastUpdatedAt).toLocaleString('ru-RU')}</time></>:<span>Событий пока нет</span>}</p>
      <Handle className={graphHandlePresentation.roadmap} type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { spec: SpecNode };

/** Показывает карту спецификаций, их зависимостей и текущих состояний с переходом к подробностям. */
export default function Roadmap({
  state,
  selected,
  onSelect,
  query,
  status,
  layoutKey,
  visibleIds,
  filterMode='dim',
  onOpenRequests,
  onOpenProposals,
  onSelectRevision,
  selectLabel='Открыть процесс',
  active=true,
}: {
  state: ProjectState;
  selected: string | null;
  onSelect: (id: string) => void;
  query: string;
  status: string;
  layoutKey: number;
  visibleIds?: string[];
  filterMode?:'dim'|'hide';
  onOpenRequests?:(id:string,revisionId?:string)=>void;
  onOpenProposals?:(id:string,revisionId?:string)=>void;
  onSelectRevision?:(id:string,revisionId:string)=>void;
  selectLabel?:string;
  active?:boolean;
}) {
  const workspace=useWorkspaceAppearance();
  const containerRef=useRef<HTMLDivElement>(null);
  const [flowInstance,setFlowInstance]=useState<ReactFlowInstance<SpecFlowNode,Edge>|null>(null);
  const measurements=useGraphMeasurements<SpecFlowNode>();
  const groups=getWorkPairGroups(state);
  const openNode=(id:string)=>{
    const group=groups.find(item=>item.id===id);
    if(group?.verifications.length&&onSelectRevision){
      const pair=getWorkPairPresentation(state,group),spec=pair.foreground;
      const bound=pair.verifications.toSorted((a,b)=>b.phaseVersion-a.phaseVersion)[0];
      const revisionId=spec.id===group.work.id?bound.revision.verification!.targetRevisionId:spec.activeRevisionId??spec.revisionIds.at(-1)!;
      onSelectRevision(spec.id,revisionId);
    }else onSelect(id);
  };
  const ownerById=new Map(groups.flatMap(group=>[group.work,...group.verifications].map(spec=>[spec.id,group.id])));
  const groupedDependencies=state.dependencies.map(dependency=>({...dependency,from:ownerById.get(dependency.from)??dependency.from,to:ownerById.get(dependency.to)??dependency.to})).filter(dependency=>dependency.from!==dependency.to);
  // Status updates retain positions; intrinsic card geometry participates in layout
  // so a paired card can grow without overlapping another node.
  const structuralKey =
    groups.map(group=>group.id+':'+group.verifications.map(item=>item.id).join(',')).join('|') +
    ";" +
    state.dependencies.map((d) => `${d.from}:${d.to}:${d.type}`).join("|") +
    layoutKey;
  const heights=Object.fromEntries(groups.map(group=>[group.id,group.verifications.length?measurements.measured[group.id]?.height??400:ROADMAP_NODE_HEIGHT]));
  const geometryKey=groups.map(group=>`${group.id}:${heights[group.id]}`).join('|');
  const initialPositions = useMemo(() => {
    return layoutRoadmap({specs:groups.map(group=>group.work),dependencies:groupedDependencies},heights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey,geometryKey]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  useEffect(() => {
    setMoved({});
  }, [layoutKey]);
  const visible = (s: Spec) =>
    visibleIds ? visibleIds.includes(s.id) :
    (!query.trim() ||
      `${s.title} ${s.humanId}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())) &&
    (!status || s.state === status);
  const nodes: SpecFlowNode[] = groups.map((group) => {
    const s=group.work,groupVisible=[s,...group.verifications].some(visible);
    const presentation=getSpecWorkPresentation(state,s);
    const revision=state.revisions.find(r=>r.id===(s.activeRevisionId??s.revisionIds.at(-1)));
    return ({
    id: s.id,
    type: "spec",
    width: ROADMAP_NODE_WIDTH,
    ...(group.verifications.length?{}:{height:ROADMAP_NODE_HEIGHT}),
    measured:measurements.measured[s.id],
    hidden:filterMode==='hide'&&!groupVisible,
    selected:[s,...group.verifications].some(item=>item.id===selected),
    position: moved[s.id] ?? initialPositions[s.id] ?? { x: 0, y: 0 },
    data: {
      state,group,openLayer:(id,revisionId)=>onSelectRevision?onSelectRevision(id,revisionId):onSelect(id),
      spec: s,
      presentation,
      openRequests:onOpenRequests,
      openProposals:onOpenProposals,
      proposalCount:state.agentProposals.filter(proposal=>proposal.projectId===state.projectId&&proposal.specId===s.id&&proposal.specRevisionId===s.activeRevisionId).length,
      revision:revision?.revision??1,
      goal:revision?.goal??'Ожидание ещё не описано',
      selected: [s,...group.verifications].some(item=>item.id===selected),
    },
    className: groupVisible ? ui.visible : ui.dimmed,
    ariaLabel: `${selectLabel} ${s.humanId}: ${s.title}. ${presentation.label}`,
  });});
  const hiddenIds=new Set(nodes.filter(node=>node.hidden).map(node=>node.id));
  const presentations=new Map(nodes.map(node=>[node.id,node.data.presentation]));
  const edges: Edge[] = groupedDependencies.map((d) => ({
    id: d.id,
    source: d.from,
    target: d.to,
    hidden:hiddenIds.has(d.from)||hiddenIds.has(d.to),
    animated:isExecutingDependency(state,d,presentations.get(d.to)),
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    className: twMerge(ui.dependency,d.type!=='depends_on'&&ui.relation),
    label: d.type === "depends_on" ? undefined : d.type,
  }));
  const change = useCallback((changes: NodeChange[]) => {
    measurements.onChanges(changes as NodeChange<SpecFlowNode>[]);
    const positions = changes.filter(
      (c) => c.type === "position" && c.position,
    );
    if (!positions.length) return;
    setMoved((prev) => {
      const next = { ...prev };
      for (const change of positions) {
        if (change.type === "position" && change.position)
          next[change.id] = change.position;
      }
      return next;
    });
  }, [measurements.onChanges]);
  return (
    <div ref={containerRef} className={twMerge('graph-container workspace-graph workspace-roadmap',ui.frame,workspace?ui.workspaceFrame:ui.legacyFrame,graphPresentation.fullscreen)} onKeyDownCapture={event => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains('react-flow__node')) return;
      const id = target.getAttribute('data-id');
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      openNode(id);
    }}>
      <ReactFlow<SpecFlowNode, Edge>
        className={graphPresentation.attribution}
        key={layoutKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={change}
        onNodeClick={(_, n) => openNode(n.id)}
        onInit={setFlowInstance}
        fitViewOptions={ROADMAP_FIT_OPTIONS}
        minZoom={ROADMAP_MIN_ZOOM}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        ariaLabelConfig={{
          'node.a11yDescription.default': `Нажмите Enter или пробел: ${selectLabel.toLocaleLowerCase()}. Стрелки перемещают карточку.`,
          "controls.zoomIn.ariaLabel": "Приблизить",
          "controls.zoomOut.ariaLabel": "Отдалить",
          "controls.fitView.ariaLabel": "Вписать граф",
          "controls.interactive.ariaLabel": "Включить перемещение",
        }}
      >
        <Background gap={24} size={1} color="var(--graph-dot)" />
        <InitialGraphViewportFit active={active} containerRef={containerRef} instance={flowInstance} fitOptions={ROADMAP_FIT_OPTIONS}/>
        <WorkspaceGraphControls containerRef={containerRef} fitOptions={ROADMAP_FIT_OPTIONS}/>
        <MiniMap
          className={graphPresentation.minimap}
          nodeColor="var(--selected)"
          maskColor="var(--minimap-mask)"
          pannable
          zoomable
        />
      </ReactFlow>
      {filterMode==='hide'&&!nodes.some(node=>!node.hidden)&&<div className={twMerge('workspace-roadmap-empty',ui.empty)} role="status">Ничего не найдено. Измените поиск или фильтры.</div>}
      <div className={twMerge('graph-caption',ui.caption)}>
        <GitBranch size={13} />
        <span>A → B: для B нужна принятая A</span>
      </div>
    </div>
  );
}
