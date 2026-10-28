import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createGitHubClient, normalizeGitHubPush, verifyGitHubSignature } from '../lib/github/verification';

const sha='a'.repeat(40),before='b'.repeat(40),repository={id:42,fullName:'ouro/demo'};
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value));
const push=(extra:Record<string,unknown>={})=>({repository:{id:42,full_name:'ouro/demo',html_url:'https://attacker.invalid',secret:'must-not-survive'},ref:'refs/heads/feature',before,after:sha,deleted:false,commits:[{id:sha,message:'untrusted message',url:'https://attacker.invalid/commit'}],...extra});
const fixtureFetch=(responses:Array<unknown|Response>)=>{
  const calls:Array<{url:string;options?:RequestInit}>=[];
  const fetcher:typeof fetch=async(input,options)=>{calls.push({url:String(input),options});const next=responses.shift();if(next instanceof Response)return next;if(next===undefined)throw new Error('Unexpected API request');return Response.json(next);};
  return {fetcher,calls};
};

test('G01: GitHub HMAC validates the official vector and original Unicode bytes',()=>{
  assert.equal(verifyGitHubSignature(Buffer.from('Hello, World!'),'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',"It's a Secret to Everybody"),true);
  const raw=bytes(push({description:'Проверка 🔐'})),secret='fixture-webhook-secret';const signature=`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`;
  assert.equal(verifyGitHubSignature(raw,signature,secret),true);
  assert.equal(verifyGitHubSignature(Buffer.concat([raw,Buffer.from(' ')]),signature,secret),false);
  assert.equal(verifyGitHubSignature(raw,signature,'other-secret'),false);
});

test('G01: absent, malformed and legacy signatures never authenticate',()=>{
  const raw=bytes(push());for(const signature of [null,'','sha1='+'a'.repeat(40),'sha256=garbage','sha256='+'f'.repeat(63),'sha256='+'g'.repeat(64)])assert.equal(verifyGitHubSignature(raw,signature,'secret'),false);
  assert.equal(verifyGitHubSignature(raw,'sha256='+'a'.repeat(64),''),false);
});

test('G01/G08: push normalization keeps only compact provenance and SHA candidates',()=>{
  const raw=bytes(push()),normalized=normalizeGitHubPush(raw);
  assert.deepEqual(normalized,{repositoryId:42,repositoryFullName:'ouro/demo',ref:'refs/heads/feature',before,after:sha,commitShas:[sha],payloadDigest:createHash('sha256').update(raw).digest('hex'),disposition:'pending'});
  assert(!JSON.stringify(normalized).includes('attacker'));assert(!JSON.stringify(normalized).includes('must-not-survive'));
});

test('G01/G08: malformed payloads and oversized bodies are rejected before any candidate is admitted',()=>{
  for(const raw of [Buffer.from('{'),bytes(null),bytes([]),bytes(push({repository:{id:0,full_name:'ouro/demo'}})),bytes(push({repository:{id:42,full_name:'https://evil.invalid/repo'}})),bytes(push({ref:42})),bytes(push({before:'short'})),bytes(push({after:'main'})),bytes(push({commits:[{id:'short'}]})),bytes(push({commits:'invalid'})),Buffer.alloc(2*1024*1024+1,32)])assert.throws(()=>normalizeGitHubPush(raw),hasCode('VALIDATION_ERROR'));
});

test('G08: delete and tag pushes have an explicit ignored outcome',()=>{
  const deleted=normalizeGitHubPush(bytes(push({deleted:true,after:'0'.repeat(40),commits:[]})));assert.equal(deleted.disposition,'ignored');assert.match(deleted.reason!,/удал/i);
  const tag=normalizeGitHubPush(bytes(push({ref:'refs/tags/v1'})));assert.equal(tag.disposition,'ignored');assert.match(tag.reason!,/ветк/i);
});

test('G08: truncated, boundary-sized and duplicate-SHA lists require review instead of false completion',()=>{
  for(const extra of [{size:2},{distinct_size:2},{commits:[{id:sha},{id:sha}]},{commits:Array.from({length:2048},(_,i)=>({id:i.toString(16).padStart(40,'0')}))}]){
    const result=normalizeGitHubPush(bytes(push(extra)));assert.equal(result.disposition,'needs_review');assert(result.reason);
  }
});

test('G02/G03: repository identity and exact API commit SHA are rechecked before returning safe provenance',async()=>{
  const token='fixture-api-token';const f=fixtureFetch([{id:42,full_name:'ouro/demo'},{sha,html_url:'https://attacker.invalid/forged',commit:{message:'Do not trust unbounded text',verification:{verified:false,reason:'unsigned'}}}]);
  const result=await createGitHubClient({fetch:f.fetcher,token}).verifyCommit(repository,sha);
  assert.equal(result.repositoryId,42);assert.equal(result.fullSha,sha);assert.equal(result.url,`https://github.com/ouro/demo/commit/${sha}`);assert.equal(result.verificationMethod,'github-api-sha');assert(Number.isFinite(Date.parse(result.verifiedAt)));
  assert.deepEqual(f.calls.map(call=>call.url),['https://api.github.com/repos/ouro/demo',`https://api.github.com/repos/ouro/demo/commits/${sha}`]);
  assert(f.calls.every(call=>new Headers(call.options?.headers).get('Authorization')===`Bearer ${token}`));assert(!JSON.stringify(result).includes(token));assert(!JSON.stringify(result).includes('attacker'));
});

test('G03: a mismatched repo or SHA cannot become a verified Action source',async()=>{
  for(const responses of [[{id:43,full_name:'ouro/demo'}],[{id:42,full_name:'ouro/demo'},{sha:'c'.repeat(40)}]]){
    const f=fixtureFetch(responses);await assert.rejects(createGitHubClient({fetch:f.fetcher}).verifyCommit(repository,sha),hasCode('VERIFICATION_FAILED'));
  }
  const f=fixtureFetch([]);await assert.rejects(createGitHubClient({fetch:f.fetcher}).verifyCommit(repository,'main'),hasCode('VALIDATION_ERROR'));assert.equal(f.calls.length,0);
  await assert.rejects(createGitHubClient({fetch:f.fetcher}).resolveRepository('https://evil.invalid/repo'),hasCode('VALIDATION_ERROR'));assert.equal(f.calls.length,0);
});

test('G03: only fixed HTTPS API redirects are followed; credentials never reach payload hosts',async()=>{
  const allowed=fixtureFetch([new Response(null,{status:301,headers:{location:'https://api.github.com/repos/ouro/renamed'}}),{id:42,full_name:'ouro/renamed'}]);
  assert.deepEqual(await createGitHubClient({fetch:allowed.fetcher}).resolveRepository('ouro/demo'),{id:42,fullName:'ouro/renamed'});assert.equal(allowed.calls.length,2);
  for(const location of ['https://evil.invalid/private','http://api.github.com/private','https://token@api.github.com/private']){const denied=fixtureFetch([new Response(null,{status:302,headers:{location}})]);await assert.rejects(createGitHubClient({fetch:denied.fetcher,token:'fixture-secret'}).resolveRepository('ouro/demo'),hasCode('VERIFICATION_FAILED'));assert.equal(denied.calls.length,1);}
});

test('G06: transient API failure carries bounded retry timing and no raw secret-bearing error',async()=>{
  const limited=fixtureFetch([new Response(null,{status:429,headers:{'Retry-After':'3'}})]);
  await assert.rejects(createGitHubClient({fetch:limited.fetcher,token:'runtime-secret'}).resolveRepository('ouro/demo'),(error:unknown)=>{const e=error as any;assert.equal(e.code,'GITHUB_UNAVAILABLE');assert.equal(e.retryable,true);assert.equal(e.retryAfterMs,3000);assert(!JSON.stringify(e).includes('runtime-secret'));return true;});
  const failed:typeof fetch=async()=>{throw new Error('upstream failure leaking runtime-secret');};
  await assert.rejects(createGitHubClient({fetch:failed,token:'runtime-secret'}).resolveRepository('ouro/demo'),(error:unknown)=>{assert.equal((error as any).code,'GITHUB_UNAVAILABLE');assert(!String(error).includes('runtime-secret'));return true;});
});
