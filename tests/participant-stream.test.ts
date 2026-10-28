import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedParticipant,issueParticipantSession,AccessError } from '../lib/auth';
import { createProjectStreamHandler,type ProjectStreamClock } from '../lib/project-stream';
import { emptyState,PROJECT_ID,AGENT_ID,type Actor } from '../packages/core/src';
const actor:Actor={id:'stream-participant',kind:'human',projectIds:[PROJECT_ID]};
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
class Clock implements ProjectStreamClock{
  time=0;tasks=new Map<object,{at:number;callback:()=>void}>();now=()=>this.time;
  schedule=(callback:()=>void,milliseconds:number)=>{const id={};this.tasks.set(id,{at:this.time+milliseconds,callback});return()=>{this.tasks.delete(id);};};
  async tick(milliseconds:number){this.time+=milliseconds;for(const [id,task] of [...this.tasks])if(task.at<=this.time&&this.tasks.delete(id))task.callback();await settle();}
}
test('C02 an already open stream reauthorizes before further reads and stops after participant revocation',async()=>{
  const clock=new Clock();let active=true,reads=0,checks=0;
  const cookie=issueParticipantSession(actor,PROJECT_ID),request=new Request('http://127.0.0.1/api/stream',{headers:{cookie:`ouro_participant=${cookie}`}});
  const handler=createProjectStreamHandler({clock,pollIntervalMs:5,store:{getProject:async()=>emptyState(),getEvents:async()=>{reads++;return {events:[],cursor:0};}},authenticateHuman:async request=>{checks++;return authenticatedParticipant(request,PROJECT_ID,AGENT_ID,async()=>active?actor:null);}});
  const response=await handler(request);assert.equal(response.status,200);const reader=response.body!.getReader();await reader.read();
  const rejected=assert.rejects(reader.read(),/Подписка недоступна/);active=false;await clock.tick(5);
  await rejected;assert.equal(reads,0);assert(checks>=2);assert.equal(clock.tasks.size,0);
});
test('C02 stream discards a snapshot if participant revocation occurs during the asynchronous SQL read',async()=>{
  const clock=new Clock();let active=true;
  const cookie=issueParticipantSession(actor,PROJECT_ID),request=new Request('http://127.0.0.1/api/stream',{headers:{cookie:`ouro_participant=${cookie}`}});
  const handler=createProjectStreamHandler({clock,store:{getProject:async()=>{active=false;return emptyState();},getEvents:async()=>({events:[],cursor:0})},authenticateHuman:async request=>authenticatedParticipant(request,PROJECT_ID,AGENT_ID,async()=>active?actor:null)});
  assert.equal((await handler(request)).status,401);assert.equal(clock.tasks.size,0);
});
