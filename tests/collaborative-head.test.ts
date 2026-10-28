import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptDraftHead,type DraftHead } from '../packages/collaboration/src/head';

const open:DraftHead={id:'draft',projectId:'project',specId:'spec',baseRevisionId:'r1',createdBy:'alice',createdAt:'2026-10-28T12:00:00Z',version:3,stateHash:'state-3',contentHash:'content-3'};
const closed:DraftHead={...open,publishedRevisionId:'r2'};
test('C05 review: delayed equal-version open GET cannot clear an already observed publication',()=>{
  const adopted=adoptDraftHead(closed,{...open});assert.equal(adopted.publishedRevisionId,'r2');assert.equal(adopted,closed);
});
test('C05 review: an allegedly newer open head cannot reopen an immutable published draft',()=>{
  assert.throws(()=>adoptDraftHead(closed,{...open,version:4,stateHash:'state-4',contentHash:'content-4'}),{code:'DRAFT_HISTORY_CONFLICT'});
});
test('C05 review: immutable anchors and observed publication IDs cannot change',()=>{
  for(const changed of [{...closed,publishedRevisionId:'other-revision'},{...open,baseRevisionId:'other-base'},{...open,createdBy:'mallory'}])assert.throws(()=>adoptDraftHead(closed,changed),{code:'DRAFT_HISTORY_CONFLICT'});
});
test('C05 review: publication at the same technical version is adopted and older reads stay stale',()=>{
  assert.equal(adoptDraftHead(open,closed),closed);assert.equal(adoptDraftHead(closed,{...open,version:2,stateHash:'state-2',contentHash:'content-2'}),closed);
});
test('C03 review: an equal technical version cannot claim different CRDT or visible content hashes',()=>{
  for(const candidate of [{...open,stateHash:'other-state'},{...open,contentHash:'other-content'}])assert.throws(()=>adoptDraftHead(open,candidate),{code:'DRAFT_HISTORY_CONFLICT'});
});
