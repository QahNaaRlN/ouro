import dagre from '@dagrejs/dagre';
import type {Dependency,DomainEvent,ProjectState} from '../packages/core/src/types';
import {getSpecWorkPresentation} from '../packages/core/src/work-presentation';

export const ROADMAP_NODE_WIDTH=264;
export const ROADMAP_NODE_HEIGHT=240;
// At the former 0.25 minimum, even 50 independent specs could not fit a 420px pane.
export const ROADMAP_MIN_ZOOM=0.01;
export const ROADMAP_FIT_OPTIONS={padding:0.14,minZoom:ROADMAP_MIN_ZOOM,maxZoom:0.9};

export function layoutRoadmap(state:Pick<ProjectState,'specs'|'dependencies'>,heights:Record<string,number>={}):Record<string,{x:number;y:number}>{
  const ids=new Set(state.specs.map(spec=>spec.id));
  const graph=new dagre.graphlib.Graph().setGraph({rankdir:'LR',nodesep:48,ranksep:74,marginx:30,marginy:30}).setDefaultEdgeLabel(()=>({}));
  for(const spec of state.specs)graph.setNode(spec.id,{width:ROADMAP_NODE_WIDTH,height:heights[spec.id]??ROADMAP_NODE_HEIGHT});
  for(const dependency of state.dependencies)if(dependency.type==='depends_on'&&ids.has(dependency.from)&&ids.has(dependency.to))graph.setEdge(dependency.from,dependency.to);
  dagre.layout(graph);
  return Object.fromEntries(state.specs.map(spec=>{const position=graph.node(spec.id);return [spec.id,{x:position.x-ROADMAP_NODE_WIDTH/2,y:position.y-(heights[spec.id]??ROADMAP_NODE_HEIGHT)/2}];}));
}

export function isExecutingDependency(state:ProjectState,dependency:Dependency,presentation?:{isRunning:boolean}):boolean{
  const target=state.specs.find(spec=>spec.id===dependency.to);
  return dependency.type==='depends_on'&&!!target&&(presentation??getSpecWorkPresentation(state,target)).isRunning;
}

/** Only a recorded causal reference within the supplied scope creates an edge. */
export function buildRealityGraph(events:DomainEvent[]){
  const byId=new Map(events.map(event=>[event.id,event]));
  const links=events.filter(event=>event.causationId&&byId.get(event.causationId)?.projectId===event.projectId);
  const neighbors=new Map(events.map(event=>[event.id,[] as string[]]));
  for(const event of links){neighbors.get(event.id)!.push(event.causationId!);neighbors.get(event.causationId!)!.push(event.id);}
  const visited=new Set<string>(),positions=new Map<string,{x:number;y:number}>();
  let offsetX=24,offsetY=24,rowHeight=0;
  for(const event of events){
    if(visited.has(event.id))continue;
    const component:string[]=[],stack=[event.id];
    while(stack.length){const id=stack.pop()!;if(visited.has(id))continue;visited.add(id);component.push(id);stack.push(...neighbors.get(id)!);}
    const componentIds=new Set(component);
    const graph=new dagre.graphlib.Graph().setDefaultEdgeLabel(()=>({})).setGraph({rankdir:'LR',ranksep:64,nodesep:28});
    for(const id of component)graph.setNode(id,{width:230,height:98});
    for(const link of links)if(componentIds.has(link.id))graph.setEdge(link.causationId!,link.id);
    dagre.layout(graph);
    const {width=230,height=98}=graph.graph();
    if(offsetX>24&&offsetX+width>1320){offsetX=24;offsetY+=rowHeight+40;rowHeight=0;}
    for(const id of component){const point=graph.node(id);positions.set(id,{x:offsetX+point.x-115,y:offsetY+point.y-49});}
    offsetX+=width+40;rowHeight=Math.max(rowHeight,height);
  }
  return {
    nodes:events.map(event=>({id:event.id,event,position:positions.get(event.id)!})),
    edges:links.map(event=>({id:`cause-${event.id}`,source:event.causationId!,target:event.id})),
  };
}
