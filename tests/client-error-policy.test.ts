import test from 'node:test';
import assert from 'node:assert/strict';
import {ClientError,type ClientErrorOccurrence} from '../packages/client/src/ports';
import {normalizeClientError,normalizeAppError,reportClientError,reportClientErrorFailure,captureClientError} from '../packages/client/src/lifecycle/client-error-reporting';

const occurrence=(id:string)=>({occurrenceId:id,code:'READ_FAILED',kind:'network',operation:'read-project',sourceId:'fixture',accessEpoch:4} as const satisfies ClientErrorOccurrence);

test('generic runtime normalization differs from the compatible transport fallback without leaking unknown messages',()=>{
 const secret='SECRET document cookie stack';
 assert.equal(normalizeClientError(new Error(secret)).kind,'network');
 const runtime=normalizeClientError(new Error(secret),'unexpected');
 assert.equal(runtime.kind,'unexpected');assert.equal(runtime.code,'UNEXPECTED_ERROR');assert(!runtime.message.includes(secret));
 const cancellation=new Error(secret);cancellation.name='AbortError';assert.equal(normalizeClientError(cancellation).kind,'cancelled');
 const access=new ClientError('ACCESS_REVOKED','Доступ изменился.','access',403);assert.equal(normalizeClientError(access),access);
});

test('reporting deduplicates one occurrence while retaining independent identical failures within a bounded window',()=>{
 const events:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}};
 reportClientError(reporter,occurrence('one'));reportClientError(reporter,occurrence('one'));assert.equal(events.length,1);
 reportClientError(reporter,occurrence('two'));assert.equal(events.length,2);
 const bounded:ClientErrorOccurrence[]=[],sink={report:(event:ClientErrorOccurrence)=>{bounded.push(event);}};
 for(let index=0;index<257;index++)reportClientError(sink,occurrence('id-'+index));
 assert.equal(bounded.length,257);reportClientError(sink,occurrence('id-0'));reportClientError(sink,occurrence('id-0'));assert.equal(bounded.length,258);
});

test('reporting rebuilds a safe DTO without serializing unknown fields or raw source URLs',()=>{
 const events:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}};
 const value={...occurrence('redaction'),sourceId:'https://example.invalid/?cookie=SECRET',rawBody:'SECRET',stack:'SECRET',toJSON(){throw new Error('Must not serialize the input');}};
 Object.defineProperty(value,'document',{enumerable:true,get(){throw new Error('Must not read unrelated fields');}});
 reportClientError(reporter,value);assert.equal(events.length,1);assert(!JSON.stringify(events).includes('SECRET'));
 assert.equal(events[0].sourceId,'untrusted-source');assert(!('rawBody' in events[0]));assert(!('stack' in events[0]));
});

test('a rejecting or throwing diagnostic sink cannot escape reporting or recursively report itself',async()=>{
 let sync=0,async=0;
 const throwing={report:()=>{sync++;throw new Error('SECRET');}},rejecting={report:async()=>{async++;throw new Error('SECRET');}};
 assert.doesNotThrow(()=>reportClientError(throwing,occurrence('failure')));reportClientError(throwing,occurrence('failure'));
 reportClientError(rejecting,occurrence('failure'));reportClientError(rejecting,occurrence('failure'));await Promise.resolve();await Promise.resolve();
 assert.equal(sync,1);assert.equal(async,1);
});

test('a structural error DTO uses the existing classification without trusting its message or prototype',()=>{
 const dto=JSON.parse('{"code":"RESPONSE_CONTRACT","kind":"contract","status":422,"message":"SECRET stack document"}');
 const error=normalizeAppError(dto);assert(error instanceof ClientError);assert.equal(error.kind,'contract');assert.equal(error.code,'RESPONSE_CONTRACT');assert.equal(error.status,422);assert.equal(error.severity,'error');assert(!error.message.includes('SECRET'));
 const cycle:Record<string,unknown>={};cycle.self=cycle;Object.defineProperty(cycle,'message',{get(){throw new Error('Must not read arbitrary error properties');}});assert.equal(normalizeAppError(cycle).kind,'unexpected');
});

test('the compatible transport normalizer does not promote an arbitrary thrown DTO to an access denial',()=>{
 const value={code:'ACCESS_REVOKED',kind:'access',status:403,message:'SECRET untrusted reply'};
 assert.equal(normalizeClientError(value).kind,'network');assert.equal(normalizeAppError(value).kind,'access');assert(!normalizeAppError(value).message.includes('SECRET'));
});

test('explicit async capture preserves rejection and propagation identity while retaining independent reused Error instances',async()=>{
 const events:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}},original=new Error('SECRET');let next=0;
 const options={reporter,occurrence:(error:ClientError)=>({occurrenceId:'async:'+String(++next),code:error.code,kind:error.kind,operation:'async-operation' as const,sourceId:'fixture'})};
 const fail=()=>Promise.reject(original).catch(value=>{throw captureClientError(value,options);});
 let normalized:unknown;await assert.rejects(fail(),error=>{normalized=error;return error instanceof ClientError&&error.kind==='unexpected'&&!error.message.includes('SECRET');});
 captureClientError(normalized,{reporter,reuseOccurrence:true,occurrence:error=>({occurrenceId:'render:propagated',code:error.code,kind:error.kind,operation:'render-ui',sourceId:'fixture'})});assert.equal(events.length,1);
 await assert.rejects(fail());assert.equal(events.length,2);assert.notEqual(events[0].occurrenceId,events[1].occurrenceId);assert(!('accessEpoch' in events[0]));
 assert.notEqual(captureClientError(normalized,{reuseOccurrence:false,occurrence:()=>{throw new Error('Diagnostic metadata failure');}}),normalized);
});

test('an issued handle retains event A when the same ClientError is captured independently as event B',()=>{
 const error=new ClientError('READ_FAILED','Безопасное сообщение.','network'),events:ClientErrorOccurrence[]=[],other:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}};
 const first=captureClientError(error,{reporter,occurrence:()=>({...occurrence('event-A'),accessEpoch:1})});
 const second=captureClientError(error,{reporter,occurrence:()=>({...occurrence('event-B'),accessEpoch:2})});
 captureClientError(first,{reporter:{report:(event:ClientErrorOccurrence)=>{other.push(event);}},reuseOccurrence:true,occurrence:()=>({...occurrence('must-not-rebind'),accessEpoch:99})});
 captureClientError(second,{reporter:{report:(event:ClientErrorOccurrence)=>{other.push(event);}},reuseOccurrence:true,occurrence:()=>({...occurrence('must-not-rebind-second'),accessEpoch:99})});
 assert.equal(other[0].occurrenceId,'event-A');assert.equal(other[0].accessEpoch,1);assert.equal(other[1].occurrenceId,'event-B');assert.equal(other[1].accessEpoch,2);assert.notEqual(first,second);assert.equal(normalizeClientError(error),error);assert.equal(events.length,2);
 const render=captureClientError(error,{occurrence:normalized=>({occurrenceId:'render-issued',code:normalized.code,kind:normalized.kind,operation:'render-ui',sourceId:'fixture'})});
 captureClientError(render,{reporter:{report:event=>{other.push(event);}},reuseOccurrence:true,occurrence:()=>occurrence('must-not-rebind-render')});assert.equal(other[2].occurrenceId,'render-issued');
});

test('metadata-only cache capture cannot attribute an ambiguous raw Error to its latest owner',()=>{
 const raw=new ClientError('READ_FAILED','Безопасное сообщение.','network'),events:ClientErrorOccurrence[]=[],reporter={report:(event:ClientErrorOccurrence)=>{events.push(event);}};
 reportClientErrorFailure(raw,{reporter,occurrence:()=>({...occurrence('cache-A'),accessEpoch:1})});
 reportClientErrorFailure(raw,{reporter,occurrence:()=>({...occurrence('cache-B'),accessEpoch:2})});
 const other:ClientErrorOccurrence[]=[];captureClientError(raw,{reporter:{report:event=>{other.push(event);}},reuseOccurrence:true,occurrence:error=>({occurrenceId:'render-ambiguous',code:error.code,kind:error.kind,operation:'render-ui',sourceId:'fixture'})});
 assert.equal(other[0].occurrenceId,'render-ambiguous');assert(!('accessEpoch' in other[0]));assert.deepEqual(events.map(event=>event.occurrenceId),['cache-A','cache-B']);assert.equal(normalizeClientError(raw),raw);
});

for(const cancelled of [false,true])test('fresh unbound handle survives '+(cancelled?'unreported cancellation':'metadata failure')+' without an earlier scope',()=>{
 const error=new ClientError(cancelled?'CANCELLED':'READ_FAILED','Безопасное исходное сообщение.',cancelled?'cancelled':'network',cancelled?499:503);
 const old=captureClientError(error,{occurrence:normalized=>({...occurrence('old-bound'),code:normalized.code,kind:normalized.kind,accessEpoch:7})});
 let factories=0;
 const fresh=captureClientError(old,{reportCancelled:!cancelled,occurrence:()=>{factories++;throw new Error('SECRET metadata failure');}});
 assert.notEqual(fresh,old);assert.deepEqual([fresh.code,fresh.kind,fresh.message,fresh.status],[old.code,old.kind,old.message,old.status]);assert.equal(normalizeClientError(old),old);assert.equal(factories,cancelled?0:1);
 const events:ClientErrorOccurrence[]=[];captureClientError(fresh,{reporter:{report:event=>{events.push(event);}},reuseOccurrence:true,occurrence:normalized=>({occurrenceId:'new-unbound-render',code:normalized.code,kind:normalized.kind,operation:'render-ui',sourceId:'fixture'})});
 assert.equal(events[0].occurrenceId,'new-unbound-render');assert(!('accessEpoch' in events[0]));
});
