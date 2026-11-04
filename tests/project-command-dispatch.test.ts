import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {freezeProjectCommandIntent,type ProjectClientScope} from '../packages/client/src/ports';
import {planProjectCommandDispatch} from '../packages/client/src/http/project-command-dispatch';
import {forgetRejectedWorkspaceIntent,getWorkspaceIntents,sendWorkspaceIntent,type WorkspaceIntent} from '../packages/client/src/http/workspace-intents';

const scope:ProjectClientScope={projectId:'dispatch-project',actorId:'dispatch-human',accessEpoch:7,hostEpoch:2};
const candidate=(current=scope,requestId:string=randomUUID(),version=12,title='Original action')=>freezeProjectCommandIntent({scope:current,operation:'execute-command',requestId,expectedVersion:version,body:JSON.stringify({type:'proposeRevision',requestId,expectedVersion:version,specId:'dispatch-spec',content:{title}})});
const saved=(intent:ReturnType<typeof candidate>,patch:Partial<WorkspaceIntent>={}):WorkspaceIntent=>({key:`${scope.actorId}:${scope.projectId}:flow`,projectId:scope.projectId,actorId:scope.actorId,url:'/api/commands',body:intent.body,requestId:intent.requestId,expectedVersion:intent.expectedVersion,label:'Исходное действие процесса',status:'unknown',uncertain:true,message:'Ответ потерян.',...patch});

test('P12 dispatch permits the exact saved UNKNOWN retry without releasing its wire or presentation',()=>{
  const intent=candidate(),original=saved(intent),before=structuredClone(original);
  const plan=planProjectCommandDispatch(scope,intent,[original],{slot:'flow',label:original.label});
  assert.equal(plan.allowed,true);assert.deepEqual(plan.rejected,[]);assert.deepEqual(original,before);
});

test('P12 explicit new dispatch releases a fresh proven rejection, without carrying its old request into the new operation',()=>{
  const original=saved(candidate(),{status:'rejected',uncertain:false,errorCode:'VERSION_CONFLICT',httpStatus:409});
  const next=candidate(scope,randomUUID(),13);
  const plan=planProjectCommandDispatch(scope,next,[original]);
  assert.equal(plan.allowed,true);assert.deepEqual(plan.rejected,[original]);assert.notEqual(next.requestId,original.requestId);
});

test('P12 an UNKNOWN that later receives VERSION_CONFLICT remains sticky and blocks a new command',async()=>{
  const current={...scope,actorId:randomUUID()},intent=candidate(current),original=saved(intent,{key:`${current.actorId}:${current.projectId}:flow`,actorId:current.actorId});
  let calls=0;
  const fetcher=async()=>{calls++;if(calls===1)throw new Error('Lost response');return Response.json({error:{code:'VERSION_CONFLICT',message:'Stale version'}},{status:409});};
  await sendWorkspaceIntent(original,undefined,fetcher);await sendWorkspaceIntent(original,undefined,fetcher);
  const pending=getWorkspaceIntents(current.projectId,current.actorId),stored=pending.find(item=>item.requestId===intent.requestId)!;
  assert.equal(stored.status,'unknown');assert.equal(stored.uncertain,true);assert.equal(stored.body,intent.body);
  assert.deepEqual(planProjectCommandDispatch(current,candidate(current),pending),{allowed:false,rejected:[]});assert.equal(calls,2);
});

test('P12 dispatch rejects changed UNKNOWN bytes, version, request, address, or presentation',()=>{
  const intent=candidate(),original=saved(intent);
  for(const changed of [candidate(scope,intent.requestId,12,'Changed action'),candidate(scope,intent.requestId,13),candidate()])assert.equal(planProjectCommandDispatch(scope,changed,[original]).allowed,false);
  assert.equal(planProjectCommandDispatch(scope,intent,[{...original,url:'/api/projects/foreign/commands'}]).allowed,false);
  assert.equal(planProjectCommandDispatch(scope,intent,[original],{slot:'another-slot',label:original.label}).allowed,false);
  assert.equal(planProjectCommandDispatch(scope,intent,[original],{slot:'flow',label:'Другое действие'}).allowed,false);
  assert.equal(planProjectCommandDispatch(scope,intent,[{...original,status:'sending'}]).allowed,false);
});

test('P12 an old or absent owner scope never admits a frozen command, including when no pending record exists',()=>{
  const intent=candidate();assert.equal(planProjectCommandDispatch(undefined,intent,[]).allowed,false);
  for(const current of [{...scope,actorId:'another-human'},{...scope,projectId:'another-project'},{...scope,accessEpoch:8},{...scope,hostEpoch:3}])assert.equal(planProjectCommandDispatch(current,intent,[]).allowed,false);
});

test('P12 a newly authorized same-actor owner may retry original wire while an old frozen owner cannot',()=>{
  const original=candidate(),wire=saved(original),reauthorized={...scope,accessEpoch:8};
  assert.equal(planProjectCommandDispatch(reauthorized,original,[wire]).allowed,false);
  const reviewed=freezeProjectCommandIntent({...original,scope:reauthorized});
  assert.equal(planProjectCommandDispatch(reauthorized,reviewed,[wire]).allowed,true);assert.equal(reviewed.body,wire.body);
});

test('P12 dispatch leaves another actor or project outside its release and blocking decisions',()=>{
  const intent=candidate(),other=saved(candidate(),{actorId:'another-human',status:'rejected',uncertain:false}),foreign=saved(candidate(),{projectId:'another-project'});
  assert.deepEqual(planProjectCommandDispatch(scope,intent,[other,foreign]),{allowed:true,rejected:[]});
});

test('P12 explicit dispatch releases only the current proven rejection and cannot clear its later UNKNOWN',async()=>{
  const current={...scope,actorId:randomUUID()},intent=candidate(current),original=saved(intent,{key:`${current.actorId}:${current.projectId}:flow`,actorId:current.actorId,status:'sending',uncertain:false});
  const reject=async()=>Response.json({error:{code:'VERSION_CONFLICT',message:'Stale version'}},{status:409});
  await sendWorkspaceIntent(original,undefined,reject);
  const rejected=getWorkspaceIntents(current.projectId,current.actorId).find(item=>item.requestId===intent.requestId)!;
  assert.equal(rejected.status,'rejected');assert.equal(rejected.uncertain,false);
  const plan=planProjectCommandDispatch(current,candidate(current),[rejected]);
  assert.equal(plan.allowed,true);assert.deepEqual(plan.rejected,[rejected]);
  await sendWorkspaceIntent(rejected,undefined,async()=>{throw new Error('Reply lost during an explicit retry');});
  plan.rejected.forEach(forgetRejectedWorkspaceIntent);
  const uncertain=getWorkspaceIntents(current.projectId,current.actorId).find(item=>item.requestId===intent.requestId)!;
  assert.equal(uncertain.status,'unknown');assert.equal(uncertain.body,intent.body);
  assert.equal(planProjectCommandDispatch(current,candidate(current),[uncertain]).allowed,false);
});

test('P12 exact recovery preserves unrelated rejected and UNKNOWN records',()=>{
  const intent=candidate(),uncertain=saved(intent),rejected=saved(candidate(),{status:'rejected',uncertain:false,key:'a-different-rejected-slot'}),otherUnknown=saved(candidate(),{key:'another-unknown-slot'});
  const plan=planProjectCommandDispatch(scope,intent,[uncertain,rejected,otherUnknown]);
  assert.equal(plan.allowed,true);assert.deepEqual(plan.rejected,[]);assert.equal(uncertain.status,'unknown');assert.equal(otherUnknown.status,'unknown');
});

test('P12 a new explicit operation closes a fresh proven rejection through the unchanged frozen-record identity',async()=>{
  const current={...scope,actorId:randomUUID()},intent=candidate(current),original=saved(intent,{key:`${current.actorId}:${current.projectId}:flow`,actorId:current.actorId,status:'sending',uncertain:false});
  await sendWorkspaceIntent(original,undefined,async()=>Response.json({error:{code:'VERSION_CONFLICT'}},{status:409}));
  const plan=planProjectCommandDispatch(current,candidate(current),getWorkspaceIntents(current.projectId,current.actorId));
  assert.equal(plan.allowed,true);assert.equal(plan.rejected.length,1);plan.rejected.forEach(forgetRejectedWorkspaceIntent);
  assert.deepEqual(getWorkspaceIntents(current.projectId,current.actorId),[]);
});
