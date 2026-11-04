import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {ReceiptProbeInput} from '../apps/web/tests/fixtures/receipt-probe';

type Fixture={projectId:string;actor:{id:string};credential:string;historical:Omit<ReceiptProbeInput,'projectId'|'actorId'>;fresh:Omit<ReceiptProbeInput,'projectId'|'actorId'>};

for(const kind of ['historical','fresh'] as const)test(`HRP browser ${kind}: actual 200 lost after ${kind==='historical'?'committed historical replay':'fresh COMMIT'}, UNKNOWN then one exact explicit retry`,async({page})=>{
 const fixture=JSON.parse(await readFile(process.env.OURO_RECEIPT_BROWSER_MANIFEST!,'utf8')) as Fixture,command=fixture[kind];
 await page.goto('/tests/fixtures/receipt-probe.html');await page.waitForFunction(()=>!!window.receiptProof);
 const login=await page.request.post('/api/participants/session',{data:{credential:fixture.credential}});expect(login.status()).toBe(200);expect((await login.json()).actor.id).toBe(fixture.actor.id);
 await page.evaluate(input=>window.receiptProof.configure(input),{...command,projectId:fixture.projectId,actorId:fixture.actor.id});
 const statuses:number[]=[],sent:(string|null)[]=[],headers:string[]=[],replayed:boolean[]=[];
 await page.route('**/api/commands',async route=>{
  sent.push(route.request().postData());const response=await route.fetch();statuses.push(response.status());headers.push(response.headers()['x-ouro-command-receipt']??'');replayed.push((await response.json()).replayed);
  if(statuses.length===1)await route.abort('failed');else await route.fulfill({response});
 });
 const first=await page.evaluate(()=>window.receiptProof.execute());expect(statuses).toEqual([200]);expect(headers[0]).toMatch(/^v1\./);expect(replayed[0]).toBe(kind==='historical');expect(first).toBe('unknown');
 expect(await page.evaluate(()=>window.receiptProof.pending())).toEqual([{requestId:command.requestId,body:command.body,status:'unknown'}]);
 expect(await page.evaluate(()=>window.receiptProof.snapshot())).toBeNull();
 const retried=await page.evaluate(()=>window.receiptProof.execute());expect(statuses).toEqual([200,200]);expect(retried).toBe('confirmed');expect(sent).toEqual([command.body,command.body]);expect(headers[1]).toBe(headers[0]);expect(replayed[1]).toBe(true);
 expect(await page.evaluate(()=>window.receiptProof.pending())).toEqual([]);expect(await page.evaluate(()=>window.receiptProof.snapshot())).toBe(command.expectedVersion+(kind==='fresh'?1:0));
 const current=await page.request.get('/api/project');expect(current.status()).toBe(200);const state=(await current.json()).state;
 expect(state.events.filter((event:{requestId?:string})=>event.requestId===command.requestId)).toHaveLength(kind==='fresh'?1:0);
 await page.evaluate(()=>window.receiptProof.dispose());
});
