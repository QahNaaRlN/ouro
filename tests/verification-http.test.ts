import test from 'node:test';
import assert from 'node:assert/strict';
import {apiError} from '../lib/http';
test('bounded runner known failures and unknown reservation outcomes remain distinct over HTTP',async()=>{
 for(const code of ['RUNNER_ERROR','VERIFICATION_INPUT_UNAVAILABLE']){const response=apiError({code,message:'Known bounded runner failure'});assert.equal(response.status,422);assert.equal((await response.json()).error.code,code);}
 const response=apiError({code:'RUNNER_OUTCOME_UNKNOWN',message:'Preserve exact request',details:{outcomeUnknown:true,requestId:'request-1'}});
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.error.details.outcomeUnknown,true);assert.equal(body.error.details.requestId,'request-1');
});
