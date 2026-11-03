import test from 'node:test';
import assert from 'node:assert/strict';
import {getViewportForBounds} from '@xyflow/react';
import {emptyState} from '../packages/core/src';
import type {Dependency,DomainEvent,Execution,Spec} from '../packages/core/src/types';
import {buildRealityGraph,isExecutingDependency,layoutRoadmap,ROADMAP_MIN_ZOOM,ROADMAP_NODE_HEIGHT,ROADMAP_NODE_WIDTH} from '../lib/workspace-graph';

const event=(id:string,version:number,causationId?:string,projectId='project'):DomainEvent=>({id,version,projectId,type:'ActionReported',schemaVersion:1,occurredAt:`2026-11-03T10:00:${String(version).padStart(2,'0')}Z`,actor:{id:'agent',kind:'agent',projectIds:[projectId]},correlationId:'work',...(causationId?{causationId}:{}),payload:{title:id}});

test('fact graph is available without planned Flow and never turns chronological order into causality',()=>{
  const facts=[event('first',1),event('second',2),event('third',3,'first')],before=JSON.stringify(facts);
  const graph=buildRealityGraph(facts);
  assert.deepEqual(graph.nodes.map(node=>node.id),facts.map(fact=>fact.id));
  assert.deepEqual(graph.edges,[{id:'cause-third',source:'first',target:'third'}]);
  assert(graph.nodes.every(node=>Number.isFinite(node.position.x)&&Number.isFinite(node.position.y)));
  assert.equal(JSON.stringify(facts),before);
});

test('filtered-out and foreign-project causes do not become artificial graph nodes or links',()=>{
  const graph=buildRealityGraph([event('foreign',1,undefined,'other-project'),event('filtered',2,'not-in-this-view'),event('cross-project',3,'foreign')]);
  assert.equal(graph.nodes.length,3);
  assert.deepEqual(graph.edges,[]);
  assert.deepEqual(buildRealityGraph([]),{nodes:[],edges:[]});
});

test('a real dependency animates only for the active revision primary execution with confirmed running state',()=>{
  const state=emptyState('project');
  const target:Spec={id:'target',projectId:state.projectId,humanId:'OURO-S-000001',title:'Target',state:'in_progress',activeRevisionId:'active',revisionIds:['old','active']};
  state.specs.push(target);
  const dependency:Dependency={id:'dependency',from:'source',to:target.id,type:'depends_on'};
  const attempt:Execution={id:'attempt',specId:target.id,specRevisionId:'active',agentId:'agent',state:'succeeded',kind:'primary'};
  state.executions.push(attempt);
  assert.equal(isExecutingDependency(state,dependency),false,'in_progress and an unaccepted result are not running');
  attempt.state='running';assert.equal(isExecutingDependency(state,dependency),true);
  attempt.specRevisionId='old';assert.equal(isExecutingDependency(state,dependency),false);
  attempt.specRevisionId='active';attempt.kind='remediation';assert.equal(isExecutingDependency(state,dependency),false);
  attempt.kind='primary';attempt.state='queued';assert.equal(isExecutingDependency(state,dependency),false);
  attempt.state='waiting_for_human';assert.equal(isExecutingDependency(state,dependency),false);
  attempt.state='running';assert.equal(isExecutingDependency(state,{...dependency,type:'relates_to'}),false);
});

test('the installed React Flow fit calculation proves the former zoom minimum clipped a 50-spec map',()=>{
  const specs:Spec[]=Array.from({length:50},(_,i)=>({id:`spec-${i}`,projectId:'project',humanId:`OURO-S-${i}`,title:`Task ${i}`,state:'idea',activeRevisionId:null,revisionIds:[]}));
  const positions=layoutRoadmap({specs,dependencies:[]});
  const xs=Object.values(positions).map(point=>point.x),ys=Object.values(positions).map(point=>point.y);
  const bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs)+ROADMAP_NODE_WIDTH,height:Math.max(...ys)-Math.min(...ys)+ROADMAP_NODE_HEIGHT};
  const former=getViewportForBounds(bounds,900,420,0.25,0.9,0.14);
  assert(bounds.height*former.zoom>420,'the former minimum cannot fit actual Dagre bounds');
  const fitted=getViewportForBounds(bounds,900,420,ROADMAP_MIN_ZOOM,0.9,0.14);
  assert(bounds.height*fitted.zoom<=420);
  assert(bounds.width*fitted.zoom<=900);
  assert.deepEqual(layoutRoadmap({specs,dependencies:[]}),positions,'non-structural events cannot change positions');
});
