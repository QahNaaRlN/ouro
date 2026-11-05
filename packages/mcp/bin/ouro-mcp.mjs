#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Соединяет прежний stdio с HTTP; версия supplement передаётся доверенным producer descriptor. */
export async function runMcpBridge({argv=process.argv.slice(2),environment=process.env,productVersion}={}){
if(argv.includes('--help')){
  process.stderr.write('Ouro MCP stdio bridge\nOURO_URL=http://127.0.0.1:3000/api/mcp\nOURO_PROJECT_ID selects the assigned project.\nOURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE is required.\nConfiguration is issued in the Ouro Agents screen. stdout is reserved for MCP.\n');
  return 0;
}
let remote,server;
try{
  const url=new URL(environment.OURO_URL??'http://127.0.0.1:3000/api/mcp');
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid URL');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw new Error('HTTPS required');
  if(environment.OURO_AGENT_TOKEN&&environment.OURO_AGENT_TOKEN_FILE)throw new Error('Ambiguous credential');
  const token=environment.OURO_AGENT_TOKEN_FILE?(await readFile(environment.OURO_AGENT_TOKEN_FILE,'utf8')).trim():environment.OURO_AGENT_TOKEN;
  if(!token)throw new Error('Credential required');
  const projectId=environment.OURO_PROJECT_ID;
  if(projectId&&!/^[A-Za-z0-9_-]{1,200}$/.test(projectId))throw new Error('Invalid project');
  const version=productVersion??JSON.parse(await readFile(new URL('../../../package.json',import.meta.url),'utf8')).version;
  remote=new Client({name:'ouro-stdio-bridge',version});
  await remote.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`,...(projectId?{'X-Ouro-Project-Id':projectId}:{})}}}));
  const supportsResources=!!remote.getServerCapabilities()?.resources;
  server=new Server({name:'ouro',version},{capabilities:{tools:{},...(supportsResources?{resources:{}}:{})},instructions:remote.getInstructions()??'Read ouro.get_context first. Human decisions and DoD acceptance remain in Ouro.'});
  server.setRequestHandler(ListToolsRequestSchema,async()=>remote.listTools());
  server.setRequestHandler(CallToolRequestSchema,async(request)=>remote.callTool(request.params));
  if(supportsResources){
    server.setRequestHandler(ListResourcesRequestSchema,async(request)=>remote.listResources(request.params));
    server.setRequestHandler(ReadResourceRequestSchema,async(request)=>remote.readResource(request.params));
  }
  await server.connect(new StdioServerTransport());
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await server?.close();await remote?.close();};
  server.onclose=()=>{void close();};
  process.on('SIGINT',()=>{void close().finally(()=>process.exit(0));});
  process.on('SIGTERM',()=>{void close().finally(()=>process.exit(0));});
  return 0;
}catch{
  process.stderr.write('Ouro MCP: connection failed. Check server availability, OURO_URL, and OURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE. No credential is printed.\n');
  await server?.close();await remote?.close();return 1;
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runMcpBridge();
