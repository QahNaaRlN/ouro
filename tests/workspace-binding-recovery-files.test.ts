import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rename,rm} from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {assertWorkspaceFolder,resolveWorkspaceFolder,type WorkspaceBinding} from '../lib/workspace-files';
import {createWorkspaceBindingRecovery,parseRecoveryInput,probeWorkspaceBinding} from '../lib/workspace-binding-recovery';
import {createTestSymlink} from './symlink-helper';

const runtime={platform:'win32' as const,node:'v24.19.0',uv:'1.52.1',architecture:'x64'};
const secret=Buffer.alloc(32,19),time=Date.parse('2026-11-03T12:00:00.000Z');
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
async function fixture(){
 const parent=path.resolve('artifacts');await mkdir(parent,{recursive:true});const base=await mkdtemp(path.join(parent,'binding-recovery-files-')),root=path.join(base,'project');await mkdir(root);await writeFile(path.join(root,'safe.txt'),'Synthetic unchanged input');
 const resolved=await resolveWorkspaceFolder(root),current:WorkspaceBinding={id:'original-binding',canonicalPath:resolved.canonicalPath,identity:resolved.identity},saved:WorkspaceBinding={...current,identity:{...current.identity,dev:'0'}};
 return {base,root,current,saved,context:{actorId:'local-human',projectId:'synthetic-project',binding:saved},close:async()=>{const absolute=path.resolve(base);assert.equal(path.dirname(absolute),parent);await rm(absolute,{recursive:true,force:true});}};
}

test('legacy zero device remains rejected by ordinary guards; explicit Windows inspection only proposes trust',async()=>{
 const f=await fixture();try{
  await assert.rejects(assertWorkspaceFolder(f.saved),hasCode('WORKSPACE_BINDING_CONFLICT'));
  const before=await readdir(f.root),service=createWorkspaceBindingRecovery({secret,now:()=>time,runtime}),inspection=await service.inspect(f.context);
  assert.equal(inspection.status,'candidate');assert.equal(inspection.eligible,true);assert.equal(inspection.origin,'unknown');assert.deepEqual(inspection.savedBinding,f.saved);assert.deepEqual(inspection.observedBinding,f.current);assert(inspection.ticket);assert(!inspection.ticket.includes(secret.toString('hex')));
  const verified=await service.verify({...f.context,ticket:inspection.ticket});assert.deepEqual(verified.observedBinding,f.current);assert.equal(verified.origin,'unknown');assert.deepEqual(verified.runtime,runtime);
  await assert.rejects(assertWorkspaceFolder(f.saved),hasCode('WORKSPACE_BINDING_CONFLICT'));assert.deepEqual(await readdir(f.root),before);assert.equal(await readFile(path.join(f.root,'safe.txt'),'utf8'),'Synthetic unchanged input');
  const healthy=await service.inspect({...f.context,binding:f.current});assert.equal(healthy.status,'healthy');assert.equal(healthy.eligible,false);assert.equal(healthy.ticket,undefined);
 }finally{await f.close();}
});

test('only Windows zero-to-nonzero same-path same-inode is a candidate, preserving large decimal identities',async()=>{
 const f=await fixture();try{
  const service=createWorkspaceBindingRecovery({secret,now:()=>time,runtime});
  for(const binding of [{...f.saved,identity:{...f.saved.identity,ino:(BigInt(f.saved.identity.ino)+1n).toString()}},{...f.saved,identity:{...f.saved.identity,dev:'999'}}]){const inspection=await service.inspect({...f.context,binding});assert.equal(inspection.eligible,false);assert.equal(inspection.ticket,undefined);}
  const nonWindows=await createWorkspaceBindingRecovery({secret,runtime:{...runtime,platform:'linux'}}).inspect(f.context);assert.equal(nonWindows.eligible,false);assert.equal(nonWindows.ticket,undefined);
  const large={...f.current,identity:{dev:'4134525016',ino:'19984723346902704'}},largeSaved={...large,identity:{...large.identity,dev:'0'}};let observed=large;const probe=async()=>observed;
  const synthetic=createWorkspaceBindingRecovery({secret,now:()=>time,runtime,probe}),inspection=await synthetic.inspect({...f.context,binding:largeSaved});assert(inspection.ticket);assert.equal((await synthetic.verify({...f.context,binding:largeSaved,ticket:inspection.ticket})).observedBinding.identity.ino,'19984723346902704');
  observed={...large,identity:{...large.identity,dev:'4134525017'}};await assert.rejects(synthetic.verify({...f.context,binding:largeSaved,ticket:inspection.ticket}),hasCode('WORKSPACE_BINDING_CONFLICT'));
  for(const identity of [{dev:'0',ino:large.identity.ino},{dev:large.identity.dev,ino:'0'}])assert.equal((await createWorkspaceBindingRecovery({secret,runtime,probe:async()=>({...large,identity})}).inspect({...f.context,binding:largeSaved})).eligible,false);
 }finally{await f.close();}
});

test('tickets reject changed author/project/binding/runtime, tampering, other owner keys and expiry',async()=>{
 const f=await fixture();try{
  let now=time;const service=createWorkspaceBindingRecovery({secret,now:()=>now,ttlMs:1000,runtime}),inspection=await service.inspect(f.context);assert(inspection.ticket);const ticket=inspection.ticket;
  for(const input of [{...f.context,actorId:'another-human',ticket},{...f.context,projectId:'another-project',ticket},{...f.context,binding:{...f.saved,id:'other-binding'},ticket},{...f.context,binding:{...f.saved,canonicalPath:f.base},ticket},{...f.context,binding:{...f.saved,identity:{...f.saved.identity,dev:'1'}},ticket},{...f.context,binding:{...f.saved,identity:{...f.saved.identity,ino:'1'}},ticket},{...f.context,ticket:ticket.slice(0,-1)+(ticket.endsWith('a')?'b':'a')},{...f.context,ticket:'invalid'}])await assert.rejects(service.verify(input),hasCode('BINDING_RECOVERY_TICKET_INVALID'));
  await assert.rejects(createWorkspaceBindingRecovery({secret:Buffer.alloc(32,7),now:()=>time,runtime}).verify({...f.context,ticket}),hasCode('BINDING_RECOVERY_TICKET_INVALID'));
  await assert.rejects(createWorkspaceBindingRecovery({secret,now:()=>time,runtime:{...runtime,node:'v24.22.1'}}).verify({...f.context,ticket}),hasCode('BINDING_RECOVERY_TICKET_INVALID'));
  now=time+1000;await assert.rejects(service.verify({...f.context,ticket}),hasCode('BINDING_RECOVERY_TICKET_EXPIRED'));
 }finally{await f.close();}
});

test('a root replaced after inspection never receives the signed identity even at the same path',async()=>{
 const f=await fixture();try{
  const service=createWorkspaceBindingRecovery({secret,now:()=>time,runtime}),inspection=await service.inspect(f.context);assert(inspection.ticket);
  await rename(f.root,path.join(f.base,'original'));await mkdir(f.root);
  await assert.rejects(service.verify({...f.context,ticket:inspection.ticket}),hasCode('WORKSPACE_BINDING_CONFLICT'));
  const changed=await service.inspect(f.context);assert.equal(changed.eligible,false);assert.equal(changed.ticket,undefined);
 }finally{await f.close();}
});

test('verification refuses a ticket when its awaited filesystem probe crosses the expiry deadline',async()=>{
 const f=await fixture();try{
  let now=time,probes=0;
  const service=createWorkspaceBindingRecovery({secret,now:()=>now,ttlMs:1000,runtime,probe:async binding=>{const observed=await probeWorkspaceBinding(binding);if(++probes===2)now+=1000;return observed;}});
  const inspection=await service.inspect(f.context);assert(inspection.ticket);
  await assert.rejects(service.verify({...f.context,ticket:inspection.ticket}),hasCode('BINDING_RECOVERY_TICKET_EXPIRED'));assert.equal(probes,2);
 }finally{await f.close();}
});

test('missing roots, non-directories and symlink aliases fail closed without a ticket',async(t)=>{
 const f=await fixture();try{
  const service=createWorkspaceBindingRecovery({secret,now:()=>time,runtime});
  for(const canonicalPath of [path.join(f.base,'missing'),path.join(f.root,'safe.txt')]){const inspection=await service.inspect({...f.context,binding:{...f.saved,canonicalPath}});assert.equal(inspection.eligible,false);assert.equal(inspection.ticket,undefined);}
  const alias=path.join(f.base,'alias');if(!await createTestSymlink(f.root,alias,process.platform==='win32'?'junction':'dir')){t.skip('Windows symlink/junction creation unavailable');return;}
  const linked=await service.inspect({...f.context,binding:{...f.saved,canonicalPath:alias}});assert.equal(linked.eligible,false);assert.equal(linked.ticket,undefined);
 }finally{await f.close();}
});

test('descriptor anchoring detects a directory moved between opening and final named-path validation',async()=>{
 const f=await fixture(),originalOpen=fsPromises.open;let moved=false;
 try{
  fsPromises.open=(async(...args:Parameters<typeof fsPromises.open>)=>{const target=await fsPromises.realpath(args[0]),handle=await originalOpen(...args);if(!moved&&target===f.current.canonicalPath){moved=true;await rename(f.root,path.join(f.base,'moved'));await mkdir(f.root);}return handle;}) as typeof fsPromises.open;
  const inspection=await createWorkspaceBindingRecovery({secret,now:()=>time,runtime}).inspect(f.context);assert.equal(moved,true);assert.equal(inspection.eligible,false);assert.equal(inspection.ticket,undefined);
 }finally{fsPromises.open=originalOpen;await f.close();}
});

test('recovery DTO permits only the frozen acknowledgement, ticket, reason and request ID',()=>{
 const input={requestId:'recovery-request-001',ticket:'signed-ticket',reason:'Owner explicitly establishes new current trust',acknowledgeUnknownContinuity:true as const};assert.deepEqual(parseRecoveryInput(input),input);
 for(const body of [{...input,acknowledgeUnknownContinuity:false},{...input,rootPath:'C:/other'},{...input,identity:{dev:'0',ino:'1'}},{...input,actorId:'local-human'},{...input,reason:' '},{...input,reason:'broken\u0000reason'},{...input,ticket:''},{...input,requestId:'tiny'}])assert.throws(()=>parseRecoveryInput(body),hasCode('VALIDATION_ERROR'));
});
