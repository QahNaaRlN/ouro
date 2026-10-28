import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeedEvents,emptyState,PROJECT_ID,replay} from '../packages/core/src';
import {projectAtCursor} from '../packages/core/src/history';

test('historical prefix preserves exact intermediate states and accepts explicit cursor zero',()=>{
  const events=createSeedEvents();
  assert.deepEqual(projectAtCursor(events,0),emptyState());
  for(const cursor of [1,Math.floor(events.length/2),events.length])assert.deepEqual(projectAtCursor(events,cursor),replay(events.slice(0,cursor)));
  assert.equal(projectAtCursor(events,1).events.length,1);assert.equal(events.length,createSeedEvents().length);
});
test('historical projection rejects invalid cursors, gaps and foreign project context',()=>{
  const events=createSeedEvents();
  for(const cursor of [-1,0.5,NaN,events.length+1])assert.throws(()=>projectAtCursor(events,cursor),{code:'INVALID_CURSOR'});
  assert.throws(()=>projectAtCursor(events.slice(1),0,PROJECT_ID),{code:'INVALID_EVENT_STREAM'});
  assert.throws(()=>projectAtCursor(events,1,'foreign-project'),{code:'INVALID_EVENT_STREAM'});
});
