"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import {
  ArrowUpRight,
  GitBranch,
  CircleCheck,
  CircleDashed,
  LockKeyhole,
  CirclePause,
} from "lucide-react";
import type { ProjectState, Spec, SpecState } from "@/packages/core/src";

export const specLabels: Record<SpecState, string> = {
  idea: "Идея",
  specified: "Специфицировано",
  in_progress: "В работе",
  blocked: "Заблокировано",
  done: "Принято",
  invalidated: "Неактуально",
};
export function Status({ state }: { state: string }) {
  const Icon =
    state === "done" || state === "succeeded" || state === "resolved"
      ? CircleCheck
      : state === "blocked" || state === "failed"
        ? LockKeyhole
        : state === "paused" || state === "waiting_for_human"
          ? CirclePause
          : CircleDashed;
  const names: Record<string, string> = {
    ...specLabels,
    queued: "В очереди",
    running: "Выполняется",
    waiting_for_human: "Ожидает человека",
    paused: "Приостановлено",
    succeeded: "Попытка успешна",
    failed: "Ошибка попытки",
    cancelled: "Отменено",
    skipped: "Пропущено",
    pending: "Нужно решение",
    resolved: "Решение записано",
    withdrawn: "Отозван",
    superseded: "Замещён",
  };
  return (
    <span className={`status status-${state}`}>
      <Icon size={13} />
      {names[state] ?? state}
    </span>
  );
}

type CardData = {
  spec: Spec;
  count: number;
  revision: number;
  selected: boolean;
  goal: string;
};
type SpecFlowNode = Node<CardData, "spec">;
function SpecNode({ data }: NodeProps<SpecFlowNode>) {
  return (
    <div className={`spec-node ${data.selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-top">
        <span className="mono">{data.spec.humanId}</span>
        <ArrowUpRight size={14} />
      </div>
      <div className="node-title">{data.spec.title}</div>
      <p className="node-goal">{data.goal}</p>
      <div className="node-bottom">
        <Status state={data.spec.state} />
        <span className="node-revision">r{data.revision}</span>
      </div>
      {data.count > 0 && (
        <div className="node-attention">
          {data.count}{" "}
          {data.count === 1 ? "запрос человеку" : "запроса человеку"}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { spec: SpecNode };

export default function Roadmap({
  state,
  selected,
  onSelect,
  query,
  status,
  layoutKey,
  visibleIds,
}: {
  state: ProjectState;
  selected: string | null;
  onSelect: (id: string) => void;
  query: string;
  status: string;
  layoutKey: number;
  visibleIds?: string[];
}) {
  // Positions depend only on the structural graph. Incoming events never move the canvas.
  const structuralKey =
    state.specs.map((s) => s.id).join("|") +
    ";" +
    state.dependencies.map((d) => `${d.from}:${d.to}`).join("|") +
    layoutKey;
  const initialPositions = useMemo(() => {
    const g = new dagre.graphlib.Graph()
      .setGraph({
        rankdir: "LR",
        nodesep: 48,
        ranksep: 74,
        marginx: 30,
        marginy: 30,
      })
      .setDefaultEdgeLabel(() => ({}));
    state.specs.forEach((s) => g.setNode(s.id, { width: 264, height: 195 }));
    state.dependencies
      .filter((d) => d.type === "depends_on")
      .forEach((d) => g.setEdge(d.from, d.to));
    dagre.layout(g);
    return Object.fromEntries(
      state.specs.map((s) => {
        const n = g.node(s.id);
        return [s.id, { x: n.x - 132, y: n.y - 97.5 }];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  useEffect(() => {
    setMoved({});
  }, [layoutKey]);
  const visible = (s: Spec) =>
    visibleIds ? visibleIds.includes(s.id) :
    (!query ||
      `${s.title} ${s.humanId}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())) &&
    (!status || s.state === status);
  const nodes: SpecFlowNode[] = state.specs.map((s) => ({
    id: s.id,
    type: "spec",
    width: 264,
    height: 195,
    position: moved[s.id] ?? initialPositions[s.id] ?? { x: 0, y: 0 },
    data: {
      spec: s,
      count: state.requests.filter(
        (r) => r.specId === s.id && r.state === "pending",
      ).length,
      revision:
        state.revisions.find((r) => r.id === s.activeRevisionId)?.revision ?? 1,
      goal:
        state.revisions.find((r) => r.id === s.activeRevisionId)?.goal ??
        "Ожидание ещё не активировано",
      selected: s.id === selected,
    },
    style: { opacity: visible(s) ? 1 : 0.2 },
    ariaLabel: `${s.humanId}. ${s.title}. ${specLabels[s.state]}`,
  }));
  const edges: Edge[] = state.dependencies.map((d) => ({
    id: d.id,
    source: d.from,
    target: d.to,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: {
      stroke: "var(--graph-edge)",
      strokeWidth: 1.5,
      strokeDasharray: d.type === "depends_on" ? undefined : "5 5",
    },
    label: d.type === "depends_on" ? undefined : d.type,
    labelStyle: { fill: "var(--text-muted)", fontSize: 10 },
  }));
  const change = useCallback((changes: NodeChange[]) => {
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
  }, []);
  return (
    <div className="graph-container">
      <ReactFlow<SpecFlowNode, Edge>
        key={layoutKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={change}
        onNodeClick={(_, n) => onSelect(n.id)}
        fitView
        fitViewOptions={{ padding: 0.14, maxZoom: 0.9 }}
        minZoom={0.25}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        ariaLabelConfig={{
          "controls.zoomIn.ariaLabel": "Приблизить",
          "controls.zoomOut.ariaLabel": "Отдалить",
          "controls.fitView.ariaLabel": "Показать весь граф",
          "controls.interactive.ariaLabel": "Включить перемещение",
        }}
      >
        <Background gap={24} size={1} color="var(--graph-dot)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor="var(--selected)"
          maskColor="var(--minimap-mask)"
          pannable
          zoomable
        />
      </ReactFlow>
      <div className="graph-caption">
        <GitBranch size={13} />
        <span>A → B: для B нужна принятая A</span>
      </div>
    </div>
  );
}
