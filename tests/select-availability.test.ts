import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectAvailability} from '../lib/select-availability';

test('empty choices and disabled choices have different explanations',()=>{
  assert.equal(selectAvailability([]),'no-options');
  assert.equal(selectAvailability([{value:'a',disabled:true}]),'all-disabled');
  assert.equal(selectAvailability([{value:'a',disabled:true},{value:'b',disabled:false}]),'available');
});

test('required placeholders do not hide missing or disabled real choices; optional “All” remains selectable',()=>{
  const placeholder={value:'',disabled:false};
  assert.equal(selectAvailability([placeholder],true),'no-options');
  assert.equal(selectAvailability([placeholder,{value:'a',disabled:true}],true),'all-disabled');
  assert.equal(selectAvailability([placeholder,{value:'a',disabled:false}],true),'available');
  assert.equal(selectAvailability([placeholder]),'available');
});
