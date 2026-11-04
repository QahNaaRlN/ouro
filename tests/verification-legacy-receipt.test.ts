import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectSnapshotAdopter} from '../packages/client/src/lifecycle/project-snapshot';
import {fixture} from './verification-fixture';

test('legacy receipt empty derived collections normalize only in read projection, retaining original immutable bytes',()=>{
 const f=fixture(),receipt=JSON.parse(JSON.stringify({state:f.state,cursor:f.state.version}));
 for(const key of ['verificationRuns','verificationReviews','verificationSlices','verificationPhases','verificationCycles','verificationRefactorAdmissions','verificationObservationConfigs','verificationObservations'])delete receipt.state[key];
 const bytes=JSON.stringify(receipt),adopter=createProjectSnapshotAdopter(f.state.projectId),result=adopter.adopt(receipt);
 assert.equal(result.status,'applied');assert.equal(JSON.stringify(receipt),bytes);assert.deepEqual(adopter.getSnapshot()?.state.verificationCycles,[]);
 assert.deepEqual(adopter.getSnapshot()?.state.revisions,receipt.state.revisions);
});
test('missing nonempty verification collections never normalize into a valid snapshot',()=>{
 const f=fixture();f.importRun();const receipt=JSON.parse(JSON.stringify({state:f.state,cursor:f.state.version}));delete receipt.state.verificationRuns;
 assert.equal(createProjectSnapshotAdopter(f.state.projectId).adopt(receipt).status,'invalid');
});
