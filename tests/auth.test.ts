import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedActor, issueLocalSession, assertHuman, readCommandBody } from '../lib/auth';
const project = 'project'; const agent='agent';
test('local signed session cannot be minted on remote hostname; spoofed actor body is irrelevant', async()=>{
  process.env.OURO_LOCAL_DEMO='1';
  assert.throws(()=>issueLocalSession(new Request('https://example.com/api/session')));
  assert.throws(()=>issueLocalSession(new Request('http://localhost:3000/api/session',{headers:{host:'evil.example:3000'}})));
  const cookie=issueLocalSession(new Request('http://127.0.0.1:3000/api/session'));
  assert.equal(authenticatedActor(new Request('http://127.0.0.1:3000/api/project',{headers:{cookie:`ouro_session=${cookie}`}}),project,agent).kind,'human');
  assert.throws(()=>authenticatedActor(new Request('http://127.0.0.1:3000/api/project',{headers:{cookie:`ouro_session=${cookie}x`}}),project,agent));
  assert.throws(()=>authenticatedActor(new Request('https://example.com/api/project',{headers:{cookie:`ouro_session=${cookie}`}}),project,agent));
});
test('agent bearer stays agent and cannot enter human command boundary',()=>{
  process.env.OURO_HUMAN_TOKEN='different-human-test-token'; process.env.OURO_AGENT_TOKEN='agent-test-token';
  const actor=authenticatedActor(new Request('http://127.0.0.1/api/commands',{headers:{authorization:'Bearer agent-test-token'}}),project,agent);
  assert.equal(actor.kind,'agent');assert.throws(()=>assertHuman(actor));
  delete process.env.OURO_HUMAN_TOKEN;delete process.env.OURO_AGENT_TOKEN;
});
test('JSON write rejects cross-origin, malformed bodies, and form submissions',async()=>{
  assert.deepEqual(await readCommandBody(new Request('http://localhost:3000/api/commands',{method:'POST',headers:{host:'127.0.0.1:3000','content-type':'application/json',origin:'http://127.0.0.1:3000'},body:'{}'})),{});
  await assert.rejects(readCommandBody(new Request('http://127.0.0.1/api/commands',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:'{}'})));
  await assert.rejects(readCommandBody(new Request('http://127.0.0.1/api/commands',{method:'POST',headers:{'content-type':'application/json'},body:'{' })));
  await assert.rejects(readCommandBody(new Request('http://127.0.0.1/api/commands',{method:'POST',body:'type=acceptSpec'})));
});
