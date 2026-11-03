import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const ci=process.env.GITHUB_ACTIONS==='true';
if(!ci&&process.env.OURO_RUNTIME_SMOKE_CONFIRM!=='ISOLATED_LOCAL_DOCKER')throw new Error('Use the isolated CI job or explicitly confirm ISOLATED_LOCAL_DOCKER.');
const pg=process.env.OURO_TEST_PG_CONTAINER,image=process.env.OURO_SMOKE_IMAGE,source=process.env.OURO_TEST_DATABASE_URL;
assert(pg&&/^[a-f0-9]{12,64}$/.test(pg)&&image&&/^[a-z0-9:._/-]+$/.test(image)&&source);
const suffix=ci?`${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`:`${Date.now()}-${randomBytes(3).readUIntBE(0,3)}`;
assert(/^\d+-\d+$/.test(suffix));
const name='ouro-runtime-'+suffix,client='ouro-runtime-client-'+suffix,network='ouro-runtime-net-'+suffix,database='ouro_runtime_'+suffix.replaceAll('-','_');
const origin='https://ouro-smoke.example.invalid',password=randomBytes(24).toString('base64url');
const owner={email:'runtime-owner@example.invalid',name:'Runtime qualification',password,projectName:'Empty closed runtime project'};
const url=new URL(source);assert.equal(url.username,'ouro');url.hostname='db';url.port='5432';url.pathname='/'+database;
let createdDB=false,createdNetwork=false,connected=false,createdApp=false;

async function docker(args,input){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',d=>{out+=String(d);});child.stderr.on('data',d=>{err+=String(d);});child.once('error',reject);child.stdin.on('error',reject);
  child.once('close',code=>code===0?resolve(out.trim()):reject(new Error(`Disposable Docker ${args[0]} failed (exit ${code}); ${err.slice(0,1500)}`)));child.stdin.end(input);
 });
}

// Isolated client uses the same Docker network, never a published host port.
async function probe({origin,owner,projectId}){
 const streams=[],password=owner.password;
 const request=(path,options={})=>new Promise((resolve,reject)=>{
  const outgoing=httpRequest('http://app:3000'+path,{method:options.method??'GET',headers:{host:new URL(origin).host,...options.headers},signal:options.signal??AbortSignal.timeout(15000)},incoming=>{
   const headers=new Headers();for(const [key,value]of Object.entries(incoming.headers))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)headers.append(key,item);
   resolve(new Response(Readable.toWeb(incoming),{status:incoming.statusCode,headers}));
  });outgoing.once('error',reject);outgoing.end(options.body);
 });
 const post=(path,body,cookie)=>request(path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 try{
 const icon=await request('/icon.svg');assert.equal(icon.status,200);assert((await icon.text()).includes('<svg'));
 const anonymous=await request('/api/projects');assert.equal(anonymous.status,401,await anonymous.text());
 const login=await post('/api/auth/login',{email:owner.email,password});assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');assert(setCookie&&/HttpOnly/.test(setCookie)&&/Secure/.test(setCookie)&&/SameSite=Strict/.test(setCookie));
 const cookie=setCookie.match(/ouro_user_session=[^;]+/)?.[0];assert(cookie);
 const projects=await(await request('/api/projects',{headers:{cookie}})).json();assert.equal(projects.projects.length,1);assert.equal(projects.projects[0].id,projectId);
 const state=await(await request('/api/projects/'+projectId,{headers:{cookie}})).json();assert.equal(state.cursor,0);assert.deepEqual(state.state.events,[]);assert.deepEqual(state.state.specs,[]);
 assert.equal((await request('/api/workspace/folders',{headers:{cookie}})).status,403);
 assert.equal((await post('/api/projects/'+projectId+'/verification/run',{},cookie)).status,403);
 assert.equal((await post('/api/projects/'+projectId+'/verification/observe',{},cookie)).status,403);
 assert.equal((await request('/api/projects',{headers:{host:'attacker.invalid',cookie}})).status,403);
 assert.equal((await request('/api/auth/logout',{method:'POST',headers:{cookie,origin:'https://attacker.invalid','content-type':'application/json'},body:'{}'})).status,403);
 for(let i=0;i<4;i++){
  const controller=new AbortController(),response=await request('/api/projects/'+projectId+'/stream?after=0',{headers:{cookie},signal:controller.signal});
  assert.equal(response.status,200);const reader=response.body.getReader();streams.push({controller,reader});
  let frame='';const deadline=setTimeout(()=>controller.abort(),10000);
  try{while(!frame.includes('\n\n')){const chunk=await reader.read();assert(!chunk.done);frame+=new TextDecoder().decode(chunk.value);assert(frame.length<1024*1024);}assert(frame.includes('event: snapshot'));}finally{clearTimeout(deadline);}
 }
 const concurrent=await Promise.all(Array.from({length:4},()=>post('/api/auth/login',{email:owner.email,password})));assert(concurrent.every(r=>r.status===200));await Promise.all(concurrent.map(r=>r.json()));
 await pause(17000); // Hold the authenticated SSE sessions across a heartbeat interval.
 for(const {controller,reader}of streams){const deadline=setTimeout(()=>controller.abort(),10000);try{const beat=await reader.read();assert(!beat.done&&new TextDecoder().decode(beat.value).includes(': heartbeat'));}finally{clearTimeout(deadline);}}
 assert.equal((await request('/api/health')).status,200);
 return {ok:true};
 }finally{for(const {controller,reader}of streams){controller.abort();await reader.cancel().catch(()=>{});}}
}
try{
 await docker(['exec',pg,'createdb','-U','ouro_admin','-O','ouro',database]);createdDB=true;
 await docker(['network','create',network]);createdNetwork=true;
 await docker(['network','connect','--alias','db',network,pg]);connected=true;
 await docker(['run','-d','--name',name,'--network',network,'--network-alias','app','--memory','384m','--memory-swap','384m','--cpus','1','--cap-drop','ALL','--security-opt','no-new-privileges:true','-e',`DATABASE_URL=${url.href}`,'-e',`OURO_PUBLIC_URL=${origin}`,'-e','NODE_OPTIONS=--max-old-space-size=256',image]);createdApp=true;
 let ready=false;
 for(let attempt=0;attempt<90;attempt++){if(await docker(['inspect','--format','{{.State.Health.Status}}',name])==='healthy'){ready=true;break;}await pause(1000);}
 assert(ready,'Image did not become healthy on real PostgreSQL.');
 // The input is generated test data, passed only over stdin to a private UID1000 file.
 const bootstrap=await docker(['exec','-i',name,'node','--input-type=module','-e',`
import{writeFileSync,rmSync}from'node:fs';import{spawnSync}from'node:child_process';
const chunks=[];for await(const c of process.stdin)chunks.push(c);const file='/tmp/ouro-runtime-owner.json';
writeFileSync(file,Buffer.concat(chunks),{mode:0o600,flag:'wx'});
const r=spawnSync(process.execPath,['.operations/bootstrap-cloud-owner.mjs'],{encoding:'utf8',env:{...process.env,OURO_BOOTSTRAP_FILE:file,OURO_BOOTSTRAP_CONFIRM:'CREATE_NEW_CLOSED_CLOUD_PROJECT'}});
rmSync(file);if(r.status!==0){console.error('Isolated owner bootstrap failed.');process.exit(r.status??1);}process.stdout.write(r.stdout);
`],JSON.stringify(owner));
 const created=JSON.parse(bootstrap);assert.equal(created.ok,true);assert.equal(created.role,'Owner');
 const clientCode="import assert from 'node:assert/strict';import{setTimeout as pause}from'node:timers/promises';import{request as httpRequest}from'node:http';import{Readable}from'node:stream';const probe="+probe.toString()+";console.log(JSON.stringify(await probe("+JSON.stringify({origin,owner,projectId:created.projectId})+")));";
 const result=JSON.parse(await docker(['run','--rm','-i','--name',client,'--network',network,'--memory','128m','--cap-drop','ALL','--security-opt','no-new-privileges:true','node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df','node','--input-type=module','-'],clientCode));assert.equal(result.ok,true);
 const inspect=JSON.parse(await docker(['inspect','--format','{"user":{{json .Config.User}},"memory":{{.HostConfig.Memory}},"oom":{{.State.OOMKilled}},"restarts":{{.RestartCount}},"running":{{.State.Running}}}',name]));
 assert.equal(inspect.user,'node');assert.equal(inspect.memory,384*1024*1024);assert.equal(inspect.oom,false);assert.equal(inspect.restarts,0);assert.equal(inspect.running,true);
 const pgMemory=Number(await docker(['inspect','--format','{{.HostConfig.Memory}}',pg]));assert.equal(pgMemory,256*1024*1024);
 assert.equal(await docker(['inspect','--format','{{.State.OOMKilled}}',pg]),'false');
 const verified=JSON.parse(await docker(['exec',name,'node','--input-type=module','-e',"import{spawnSync}from'node:child_process';const r=spawnSync(process.execPath,['.operations/verify-postgres.mjs'],{stdio:'inherit',env:{...process.env,OURO_VERIFY_DATABASE_URL:process.env.DATABASE_URL}});process.exit(r.status??1);"]));assert.equal(verified.ok,true);assert.equal(verified.migrations,12);
 const stats=await docker(['stats','--no-stream','--format','{{.Name}} {{.MemUsage}} {{.CPUPerc}}',name,pg]);
 let peak='unavailable';try{peak=await docker(['exec',name,'cat','/sys/fs/cgroup/memory.peak']);}catch{}
 console.log(JSON.stringify({ok:true,postgres:'17.11',runtimeUser:'node',appLimitBytes:inspect.memory,pgLimitBytes:pgMemory,appPeakBytes:peak,parallelLogins:4,sseSessions:4,stats,scope:'Single closed empty project; native Argon2 login, DB/SSE/Host/Origin and cloud capability guards. Actual public TLS/SMTP remain separate.'}));
}finally{
 await docker(['rm','-f',client]).catch(()=>{});
 if(createdApp)await docker(['rm','-f',name]).catch(()=>{});
 if(connected)await docker(['network','disconnect',network,pg]).catch(()=>{});
 if(createdNetwork)await docker(['network','rm',network]).catch(()=>{});
 if(createdDB)await docker(['exec',pg,'dropdb','-U','ouro_admin',database]).catch(()=>{});
}
