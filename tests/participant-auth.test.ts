import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedParticipant,issueParticipantSession,issueLocalSession,participantCookie,AccessError } from '../lib/auth';
import { PROJECT_ID,AGENT_ID,type Actor } from '../packages/core/src';
const alice:Actor={id:'participant-alice',kind:'human',name:'Алиса из реестра',projectIds:[PROJECT_ID]};
const bob:Actor={id:'participant-bob',kind:'human',name:'Борис из реестра',projectIds:[PROJECT_ID]};
const request=(cookie:string,authorization?:string)=>new Request('http://127.0.0.1/api/project',{headers:{cookie,...(authorization===undefined?{}:{authorization})}});
const denied=(e:unknown)=>e instanceof AccessError&&e.status===401;
test('C01 signed participant cookies produce distinct current registry identities and do not contain credentials',async()=>{
  const a=issueParticipantSession(alice,PROJECT_ID),b=issueParticipantSession(bob,PROJECT_ID);
  const resolve=async(id:string)=>id===alice.id?alice:id===bob.id?bob:null;
  assert.notEqual(a,b);assert.deepEqual(await authenticatedParticipant(request(`ouro_participant=${a}`),PROJECT_ID,AGENT_ID,resolve),alice);
  assert.deepEqual(await authenticatedParticipant(request(`ouro_participant=${b}`),PROJECT_ID,AGENT_ID,resolve),bob);
  assert(!a.includes('ouro_human_'));assert.equal(participantCookie(request(`other=x; ouro_participant=${a}; ouro_session=old`)),a);
  await assert.rejects(authenticatedParticipant(request(`ouro_participant=${a}`),PROJECT_ID,AGENT_ID,async()=>({...alice,name:'Чужой scope',projectIds:['foreign']})),denied);
});
test('C01/C02 invalid or revoked participant cookies never fall back to a valid local demo cookie',async()=>{
  const previous=process.env.OURO_LOCAL_DEMO;process.env.OURO_LOCAL_DEMO='1';
  try{
    const demo=issueLocalSession(request('')),valid=issueParticipantSession(alice,PROJECT_ID);
    const tampered=valid.slice(0,-1)+(valid.endsWith('0')?'1':'0');
    for(const participant of ['',valid+'x','broken',tampered])await assert.rejects(authenticatedParticipant(request(`ouro_session=${demo}; ouro_participant=${participant}`),PROJECT_ID,AGENT_ID,async()=>alice),denied);
    await assert.rejects(authenticatedParticipant(request(`ouro_session=${demo}; ouro_participant=${valid}`),PROJECT_ID,AGENT_ID,async()=>null),denied);
    await assert.rejects(authenticatedParticipant(request(`ouro_participant=${valid}; ouro_participant=${valid}`),PROJECT_ID,AGENT_ID,async()=>alice),denied);
    assert.equal((await authenticatedParticipant(request(`ouro_session=${demo}`),PROJECT_ID,AGENT_ID)).id,'local-human');
    const expires=Date.now()+2,short=issueParticipantSession(alice,PROJECT_ID,expires);await new Promise(resolve=>setTimeout(resolve,5));
    await assert.rejects(authenticatedParticipant(request(`ouro_session=${demo}; ouro_participant=${short}`),PROJECT_ID,AGENT_ID,async()=>alice),denied);
  }finally{if(previous===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=previous;}
});
test('C01 explicit Authorization takes precedence and invalid bearer cannot borrow a participant or demo cookie',async()=>{
  const previous=process.env.OURO_HUMAN_TOKEN;process.env.OURO_HUMAN_TOKEN='participant-auth-human-fixture';
  try{
    const cookie=issueParticipantSession(alice,PROJECT_ID),resolve=async()=>alice;
    assert.equal((await authenticatedParticipant(request(`ouro_participant=${cookie}`,'Bearer participant-auth-human-fixture'),PROJECT_ID,AGENT_ID,resolve)).id,'human-token');
    for(const value of ['Bearer wrong','wrong',''])await assert.rejects(authenticatedParticipant(request(`ouro_participant=${cookie}`,value),PROJECT_ID,AGENT_ID,resolve),denied);
    assert.equal((await authenticatedParticipant(request('ouro_participant=broken','Bearer participant-auth-human-fixture'),PROJECT_ID,AGENT_ID,resolve)).id,'human-token');
  }finally{if(previous===undefined)delete process.env.OURO_HUMAN_TOKEN;else process.env.OURO_HUMAN_TOKEN=previous;}
});

test('C07 expected participant guards cookie, local-demo and human-token identities before a receipt lookup',async()=>{
  const previousDemo=process.env.OURO_LOCAL_DEMO,previousHuman=process.env.OURO_HUMAN_TOKEN;
  process.env.OURO_LOCAL_DEMO='1';process.env.OURO_HUMAN_TOKEN='expected-participant-fixture';
  try{
    const cases:[Request,string,Actor?][]=[
      [request(`ouro_participant=${issueParticipantSession(bob,PROJECT_ID)}`),bob.id,bob],
      [request(`ouro_session=${issueLocalSession(request(''))}`),'local-human'],
      [request('','Bearer expected-participant-fixture'),'human-token'],
    ];
    for(const [original,id,resolved] of cases){
      const call=(expected:string)=>{const headers=new Headers(original.headers);headers.set('X-Ouro-Expected-Participant',expected);return authenticatedParticipant(new Request(original.url,{headers}),PROJECT_ID,AGENT_ID,async()=>resolved??null);};
      await assert.rejects(call(alice.id),error=>error instanceof AccessError&&error.code==='PARTICIPANT_CHANGED'&&error.status===401);
      assert.equal((await call(id)).id,id);
    }
  }finally{
    if(previousDemo===undefined)delete process.env.OURO_LOCAL_DEMO;else process.env.OURO_LOCAL_DEMO=previousDemo;
    if(previousHuman===undefined)delete process.env.OURO_HUMAN_TOKEN;else process.env.OURO_HUMAN_TOKEN=previousHuman;
  }
});
