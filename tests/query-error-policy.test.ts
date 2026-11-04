import test from 'node:test';
import assert from 'node:assert/strict';
import {ClientError,type ClientErrorOccurrence,type ClientErrorKind} from '../packages/client/src/ports';
import {createProjectQueryClient} from '../packages/frontend/src/api/project-session';

test('actual Query and Mutation caches respect one UI owner and suppression independently from reporting',async()=>{
 for(const operation of ['query','mutation']as const)for(const kind of ['access','contract','network','cancelled','rejected','unexpected']as ClientErrorKind[])for(const errorUi of ['field','inline','boundary','toast','silent']as const)for(const suppressToast of [false,true]){
  const events:ClientErrorOccurrence[]=[],notifications:ClientError[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}};
  const client=createProjectQueryClient({reporter,notify:(error:ClientError)=>{notifications.push(error);}}),error=new ClientError('POLICY_TEST','Безопасное сообщение.',kind);
  const meta={errorUi,suppressToast,errorReportOwner:errorUi==='boundary'?'boundary' as const:'cache' as const};
  try{
   if(operation==='query')await assert.rejects(client.fetchQuery({queryKey:['error-policy'],queryFn:async()=>{throw error;},meta}),value=>value===error);
   else await assert.rejects(client.getMutationCache().build(client,{mutationFn:async()=>{throw error;},meta}).execute(undefined),value=>value===error);
   const description=JSON.stringify({operation,kind,errorUi,suppressToast});
   assert.equal(events.length,errorUi==='boundary'?0:1,description+' diagnostics');
   assert.equal(notifications.length,errorUi==='toast'&&!suppressToast&&kind!=='cancelled'?1:0,description+' notification');
   if(operation==='query')assert.equal(client.getQueryCache().find({queryKey:['error-policy']})?.state.error,error);
  }finally{client.clear();}
 }
});

test('operation-owned capture is not repeated by cache callbacks, and optional notification failure cannot replace Query error',async()=>{
 const events:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}},error=new ClientError('READ_FAILED','Безопасное сообщение.','network');
 const client=createProjectQueryClient({reporter,notify:()=>{throw new Error('SECRET sink');}});
 try{
  await assert.rejects(client.fetchQuery({queryKey:['owned'],queryFn:async()=>{throw error;},meta:{errorUi:'inline',errorReportOwner:'operation'}}),value=>value===error);assert.equal(events.length,0);
  await assert.rejects(client.fetchQuery({queryKey:['notify'],queryFn:async()=>{throw error;},meta:{errorUi:'toast'}}),value=>value===error);assert.equal(events.length,1);
  assert.equal(client.getQueryCache().find({queryKey:['notify']})?.state.error,error);
  await assert.rejects(client.fetchQuery({queryKey:['independent'],queryFn:async()=>{throw error;},meta:{errorUi:'inline'}}),value=>value===error);assert.equal(events.length,2);assert.notEqual(events[0].occurrenceId,events[1].occurrenceId);
 }finally{client.clear();}
});

test('cache policy never invokes a caller throwOnError predicate or sends a competing notification',async()=>{
 for(const returnValue of [false,true])for(const operation of ['query','mutation']as const){
  let predicates=0,notifications=0;const error=new ClientError('READ_FAILED','Безопасное сообщение.','network'),client=createProjectQueryClient({notify:()=>{notifications++;}});
  const throwOnError=()=>{predicates++;return returnValue;};
  try{
   if(operation==='query'){const options={queryKey:['predicate'],queryFn:async()=>{throw error;},throwOnError,meta:{errorUi:'toast' as const}};await assert.rejects(client.fetchQuery(options),value=>value===error);}
   else{const options={mutationFn:async()=>{throw error;},throwOnError,meta:{errorUi:'toast' as const}};await assert.rejects(client.getMutationCache().build(client,options).execute(undefined),value=>value===error);}
   assert.equal(predicates,0);assert.equal(notifications,0);
  }finally{client.clear();}
 }
});
