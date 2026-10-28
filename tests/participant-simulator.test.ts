import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/store';
import { issueParticipantSession } from '../lib/auth';
import { POST } from '../app/api/simulator/route';
import { PROJECT_ID,type Actor } from '../packages/core/src';
const operator:Actor={id:'local-human',kind:'human',projectIds:[PROJECT_ID]};
test('C02 simulator delegation belongs to the trusted local operator, never a revocable participant identity',async()=>{
  const store=await createStore({dataDir:'memory://'}),runtime=globalThis as typeof globalThis&{__ouroStore?:Promise<Awaited<ReturnType<typeof createStore>>>},previous=runtime.__ouroStore,oldDemo=process.env.OURO_LOCAL_DEMO;
  runtime.__ouroStore=Promise.resolve(store);process.env.OURO_LOCAL_DEMO='1';
  try{
    const created=await store.createParticipant('Участник не оператор',operator),actor=(await store.authenticateParticipantCredential(created.credential))!,state=await store.getProject();
    const execution=state.executions.find(execution=>!['succeeded','failed','cancelled','skipped'].includes(execution.state))!;assert(execution);
    const request=new Request('http://127.0.0.1/api/simulator',{method:'POST',headers:{'content-type':'application/json',cookie:`ouro_participant=${issueParticipantSession(actor,PROJECT_ID)}`},body:JSON.stringify({scenario:'action',specId:execution.specId,requestId:crypto.randomUUID(),expectedVersion:state.version})});
    assert.equal((await POST(request)).status,403);assert.equal((await store.getProject()).version,state.version);
  }finally{await store.close();if(previous===undefined)delete runtime.__ouroStore;else runtime.__ouroStore=previous;if(oldDemo===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=oldDemo;}
});
