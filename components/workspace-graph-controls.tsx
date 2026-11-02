'use client';

import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {ControlButton,Controls,useNodesInitialized,useReactFlow,useUpdateNodeInternals,type Edge,type FitViewOptions,type Node,type NodeChange,type ReactFlowInstance,type Viewport} from '@xyflow/react';
import {Maximize2,Minimize2} from 'lucide-react';

/** Controlled React Flow nodes must retain the dimensions reported by its observer. */
export function useGraphMeasurements<NodeType extends Node>(){
  const [measured,setMeasured]=useState<Record<string,{width:number;height:number}>>({});
  const onChanges=useCallback((changes:NodeChange<NodeType>[])=>{
    const dimensions=changes.filter(change=>change.type==='dimensions'&&change.dimensions&&change.dimensions.width>0&&change.dimensions.height>0);
    if(!dimensions.length)return;
    setMeasured(current=>{
      let next=current;
      for(const change of dimensions){
        if(change.type!=='dimensions'||!change.dimensions)continue;
        const {width,height}=change.dimensions,previous=current[change.id];
        if(previous?.width===width&&previous.height===height)continue;
        if(next===current)next={...current};
        next[change.id]={width,height};
      }
      return next;
    });
  },[]);
  return {measured,onChanges};
}

/** Hidden views are measured on activation; only their first valid viewport is fitted. */
export function InitialGraphViewportFit<NodeType extends Node,EdgeType extends Edge>({active,containerRef,instance,fitOptions,fitKey=''}:{active:boolean;containerRef:RefObject<HTMLElement|null>;instance:ReactFlowInstance<NodeType,EdgeType>|null;fitOptions:FitViewOptions<NodeType>;fitKey?:string}){
  const nodesReady=useNodesInitialized(),flow=useReactFlow<NodeType,EdgeType>(),updateNodeInternals=useUpdateNodeInternals(),fittedKey=useRef<string|null>(null);
  useEffect(()=>{
    const container=containerRef.current;
    if(!active||!instance||!flow.viewportInitialized||!container||(nodesReady&&fittedKey.current===fitKey))return;
    let cancelled=false,frame=0,pending=false;
    const schedule=()=>{
      if(cancelled||pending||(nodesReady&&fittedKey.current===fitKey))return;
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        frame=0;
        const bounds=container.getBoundingClientRect();
        if(cancelled||!container.getClientRects().length||bounds.width<=0||bounds.height<=0)return;
        if(!nodesReady){
          const ids=flow.getNodes().filter(node=>!node.hidden).map(node=>node.id);
          if(ids.length)updateNodeInternals(ids);
          return;
        }
        pending=true;
        void flow.fitView(fitOptions).then(ok=>{
          pending=false;
          const current=container.getBoundingClientRect();
          if(!cancelled&&ok&&container.getClientRects().length&&current.width>0&&current.height>0)fittedKey.current=fitKey;
        }).catch(()=>{pending=false;});
      });
    };
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(schedule);
    observer?.observe(container);schedule();
    return()=>{cancelled=true;cancelAnimationFrame(frame);observer?.disconnect();};
  },[active,nodesReady,instance,flow,containerRef,fitOptions,fitKey,updateNodeInternals]);
  return null;
}

/** Extends the installed React Flow controls without replacing their behavior. */
export function WorkspaceGraphControls({containerRef,fitOptions}:{containerRef:RefObject<HTMLElement|null>;fitOptions:FitViewOptions}){
  const {fitView,getViewport,setViewport}=useReactFlow();
  const [supported,setSupported]=useState(false),[fullscreen,setFullscreen]=useState(false),[error,setError]=useState('');
  const savedViewport=useRef<Viewport|null>(null);
  useEffect(()=>{
    const container=containerRef.current;
    setSupported(!!container&&document.fullscreenEnabled&&typeof container.requestFullscreen==='function');
    let frame=0;
    const changed=()=>{
      const active=document.fullscreenElement===container;
      setFullscreen(active);
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if(active)void fitView(fitOptions).catch(()=>setError('Не удалось вписать граф. Используйте управление масштабом.'));
        else if(savedViewport.current){const viewport=savedViewport.current;savedViewport.current=null;void setViewport(viewport,{duration:0}).catch(()=>setError('Не удалось восстановить масштаб графа.'));}
      });
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!event.repeat&&document.fullscreenElement===container){
        void document.exitFullscreen().catch(()=>{if(document.fullscreenElement===container)setError('Не удалось выйти из полноэкранного режима. Используйте кнопку выхода.');});
      }
    };
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('keydown',escape);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('fullscreenchange',changed);document.removeEventListener('keydown',escape);};
  },[containerRef,fitView,getViewport,setViewport,fitOptions]);
  const toggle=async()=>{
    const container=containerRef.current;if(!container)return;setError('');
    try{
      if(document.fullscreenElement===container)await document.exitFullscreen();
      else{savedViewport.current=getViewport();await container.requestFullscreen();}
    }catch{savedViewport.current=null;setError('Браузер не разрешил полноэкранный режим. Граф и текущий выбор сохранены.');}
  };
  return <>
    <Controls className="workspace-graph-controls" showInteractive={false} fitViewOptions={fitOptions}>
      <ControlButton title={supported?(fullscreen?'Выйти из полного экрана':'На весь экран'):'Полноэкранный режим недоступен в этом браузере'} aria-label={fullscreen?'Выйти из полного экрана':'На весь экран'} aria-pressed={fullscreen} disabled={!supported} onClick={()=>void toggle()}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</ControlButton>
    </Controls>
    {error&&<div className="workspace-graph-feedback" role="alert">{error}</div>}
    {!supported&&<span className="workspace-graph-unavailable">Полный экран недоступен</span>}
  </>;
}
