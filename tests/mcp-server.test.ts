import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createOuroMcpServer } from '../packages/mcp/src/server';
import { createStore } from '../lib/store';
import { AGENT_ID, PROJECT_ID } from '../packages/core/src';

test('AC03: real SDK HTTP client discovers tools and reads only assigned work', async()=>{
  const store=await createStore({dataDir:'memory://'});
  const actor={id:AGENT_ID,kind:'agent' as const,projectIds:[PROJECT_ID]};
  const listener=createServer(async(req,res)=>{
    const server=createOuroMcpServer({store,actor});
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:256_000});
    try {
      await server.connect(transport);
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(', '):value);
      const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
      const response=await transport.handleRequest(request);
      const body=await response.text();res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
    }catch{res.writeHead(500).end();}finally{await server.close();}
  });
  await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const address=listener.address() as {port:number};
  const client=new Client({name:'independent-http-acceptance',version:'1.0.0'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
    const inventory=await client.listTools();
    for(const name of ['ouro.get_context','ouro.get_updates','ouro.report_action','ouro.report_question','ouro.report_fork','ouro.report_blocker','ouro.confirm_started','ouro.confirm_stopped','ouro.complete_execution'])assert.ok(inventory.tools.some(t=>t.name===name),name);
    assert.ok(!inventory.tools.some(t=>/resolve|accept_spec|activate/.test(t.name)));
    const context=await client.callTool({name:'ouro.get_context',arguments:{}});
    assert.equal(context.isError,undefined);
    assert.ok(context.structuredContent);
    const bad=await client.callTool({name:'ouro.report_question',arguments:{actor:{kind:'human'}}});
    assert.equal(bad.isError,true);
  }finally{await client.close();await new Promise<void>(resolve=>listener.close(()=>resolve()));await store.close();}
});
