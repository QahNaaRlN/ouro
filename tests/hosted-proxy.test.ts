import test from 'node:test';
import assert from 'node:assert/strict';
import {readCommandBody} from '../lib/auth';
test('canonical HTTPS origin survives internal HTTP proxy URL and ignores untrusted forwarding headers',async()=>{
 const previous=process.env.OURO_PUBLIC_URL;process.env.OURO_PUBLIC_URL='https://ouroapp.ru';
 const request=(host:string,origin:string)=>new Request('http://ouro-app:3000/api/auth/login',{method:'POST',headers:{host,origin,'content-type':'application/json','x-forwarded-host':'attacker.invalid','x-forwarded-proto':'http'},body:'{"value":"preserved"}'});
 try{
  assert.deepEqual(await readCommandBody(request('ouroapp.ru','https://ouroapp.ru')),{value:'preserved'});
  for(const [host,origin]of [['ouroapp.ru','https://attacker.invalid'],['attacker.invalid','http://attacker.invalid'],['ouroapp.ru','http://ouroapp.ru']])await assert.rejects(readCommandBody(request(host,origin)),(e:unknown)=>(e as {code:string}).code==='FORBIDDEN');
 }finally{if(previous===undefined)delete process.env.OURO_PUBLIC_URL;else process.env.OURO_PUBLIC_URL=previous;}
});
