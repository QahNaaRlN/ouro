import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHostedEnvironment} from '../scripts/hosted-next.mjs';
import {checkHealth} from '../lib/health';
const valid={OURO_PUBLIC_URL:'https://ouroapp.ru',DATABASE_URL:'postgresql://test:test@db/test'};
test('hosted launcher refuses accidental local authority, invalid origin and missing PostgreSQL',()=>{
 assert.deepEqual(validateHostedEnvironment(valid),{origin:'https://ouroapp.ru',port:'3000'});
 for(const overrides of [{OURO_LOCAL_DEMO:'1'},{OURO_HUMAN_TOKEN:'secret'},{OURO_AGENT_TOKEN:'secret'},{OURO_PUBLIC_URL:'http://ouroapp.ru'},{OURO_PUBLIC_URL:'https://ouroapp.ru/path'},{OURO_PUBLIC_URL:'https://user:secret@ouroapp.ru'},{DATABASE_URL:''},{PORT:'3000 --help'}])assert.throws(()=>validateHostedEnvironment({...valid,...overrides}));
});
test('readiness checks storage without exposing projects or internal failure details',async()=>{
 let queried='';const good=await checkHealth(async()=>({inspect:async sql=>{queried=sql;}}),'postgres');
 assert.equal(queried,'SELECT 1');assert.equal(good.status,200);assert.deepEqual(await good.json(),{status:'ok',storage:'postgres'});
 const bad=await checkHealth(async()=>{throw new Error('postgresql://user:secret@db/project');},'postgres');
 assert.equal(bad.status,503);assert.deepEqual(await bad.json(),{status:'unavailable'});
 const hung=await checkHealth(()=>new Promise(()=>{}),'postgres',5);assert.equal(hung.status,503);
});
