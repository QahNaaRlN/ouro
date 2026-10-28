import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client=new Client({name:'ouro-connection-check',version:'0.1.0-alpha.3'});
try{
  const url=new URL(process.env.OURO_URL??'http://127.0.0.1:3000/api/mcp');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(local&&url.protocol==='http:')))throw new Error();
  if(process.env.OURO_AGENT_TOKEN&&process.env.OURO_AGENT_TOKEN_FILE)throw new Error();
  const token=process.env.OURO_AGENT_TOKEN_FILE?(await readFile(process.env.OURO_AGENT_TOKEN_FILE,'utf8')).trim():process.env.OURO_AGENT_TOKEN;
  if(!token)throw new Error();
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const tools=await client.listTools();
  const context=await client.callTool({name:'ouro.get_context',arguments:{}});
  if(context.isError)throw new Error();
  const data=context.structuredContent??{};
  console.log(JSON.stringify({connected:true,server:'ouro',tools:tools.tools.map(t=>t.name),agent:data.agent,assignments:Array.isArray(data.work)?data.work.length:0,cursor:data.cursor},null,2));
}catch{
  console.error('Ouro: connection check failed. Check OURO_URL and OURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE. The key is not printed.');
  process.exitCode=1;
}finally{await client.close();}
