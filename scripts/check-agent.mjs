import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
/** Проверяет подключение без app build; credentials берутся только из переданного process environment. */
export async function runAgentCheck({environment=process.env}={}){
const client=new Client({name:'ouro-connection-check',version:'0.1.0-alpha.4'});
try{
  const url=new URL(environment.OURO_URL??'http://127.0.0.1:3000/api/mcp');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(local&&url.protocol==='http:')))throw new Error();
  if(environment.OURO_AGENT_TOKEN&&environment.OURO_AGENT_TOKEN_FILE)throw new Error();
  const token=environment.OURO_AGENT_TOKEN_FILE?(await readFile(environment.OURO_AGENT_TOKEN_FILE,'utf8')).trim():environment.OURO_AGENT_TOKEN;
  if(!token)throw new Error();
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const tools=await client.listTools();
  const context=await client.callTool({name:'ouro.get_context',arguments:{}});
  if(context.isError)throw new Error();
  const data=context.structuredContent??{};
  console.log(JSON.stringify({connected:true,server:'ouro',tools:tools.tools.map(t=>t.name),agent:data.agent,assignments:Array.isArray(data.work)?data.work.length:0,cursor:data.cursor},null,2));
  return 0;
}catch{
  console.error('Ouro: connection check failed. Check OURO_URL and OURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE. The key is not printed.');
  return 1;
}finally{await client.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runAgentCheck();
