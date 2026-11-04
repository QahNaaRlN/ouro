import assert from 'node:assert/strict';
import {test} from 'node:test';
import {throwAfterStartupCleanup} from '../src/runtime/cleanup-startup.js';

test('failed worker cleanup does not skip other drain attempts or replace the startup cause',async()=>{
 const cause=new Error('fixture startup cause'),attempts:string[]=[];let caught:unknown;
 try{await throwAfterStartupCleanup(cause,{stopWorker:()=>{attempts.push('worker');throw new Error('private cleanup detail');},stopHttp:async()=>{attempts.push('http');},stopBackground:async()=>{attempts.push('store-background');},closeStore:async()=>{attempts.push('store');}});}catch(error){caught=error;}
 assert.deepEqual(attempts,['worker','http','store-background']);
 const result=caught as Error&{cleanup?:readonly {resource:string;status:string}[]};
 assert.equal(result.cause,cause);assert.deepEqual(result.cleanup,[{resource:'worker',status:'rejected'},{resource:'http',status:'fulfilled'},{resource:'store-background',status:'fulfilled'},{resource:'store',status:'skipped-undrained'}]);
 assert.equal(JSON.stringify(result.cleanup).includes('private cleanup detail'),false);
});

test('database close follows every confirmed drain and successful cleanup preserves the original error',async()=>{
 const cause=new Error('fixture startup cause'),attempts:string[]=[];let release:()=>void=()=>undefined,httpDone=false,caught:unknown;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 const result=throwAfterStartupCleanup(cause,{stopWorker:async()=>{attempts.push('worker');},stopHttp:async()=>{attempts.push('http');await pending;httpDone=true;},stopBackground:async()=>{attempts.push('store-background');},closeStore:async()=>{assert.equal(httpDone,true);attempts.push('store');}}).catch(error=>{caught=error;});
 await Promise.resolve();assert.equal(attempts.includes('store'),false);release();await result;
 assert.equal(caught,cause);assert.deepEqual(attempts,['worker','http','store-background','store']);
});

test('failed DB close is explicit and keeps the original startup failure as cause',async()=>{
 const cause=new Error('fixture startup cause');let caught:unknown;
 try{await throwAfterStartupCleanup(cause,{closeStore:async()=>{throw new Error('private SQL cleanup detail');}});}catch(error){caught=error;}
 const result=caught as Error&{cleanup?:readonly {resource:string;status:string}[]};assert.equal(result.cause,cause);assert.deepEqual(result.cleanup,[{resource:'store',status:'rejected'}]);
});
