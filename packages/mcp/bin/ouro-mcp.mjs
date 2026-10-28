#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema,CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

if(process.argv.includes('--help')){
  process.stderr.write('Ouro MCP stdio bridge\nOURO_URL=http://127.0.0.1:3000/api/mcp\nOURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE is required.\nConfiguration is issued in the Ouro Agents screen. stdout is reserved for MCP.\n');
  process.exit(0);
}
let remote,server;
try{
  const url=new URL(process.env.OURO_URL??'http://127.0.0.1:3000/api/mcp');
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid URL');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw new Error('HTTPS required');
  if(process.env.OURO_AGENT_TOKEN&&process.env.OURO_AGENT_TOKEN_FILE)throw new Error('Ambiguous credential');
  const token=process.env.OURO_AGENT_TOKEN_FILE?(await readFile(process.env.OURO_AGENT_TOKEN_FILE,'utf8')).trim():process.env.OURO_AGENT_TOKEN;
  if(!token)throw new Error('Credential required');
  remote=new Client({name:'ouro-stdio-bridge',version:'0.1.0-alpha.4'});
  await remote.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  server=new Server({name:'ouro',version:'0.1.0-alpha.4'},{capabilities:{tools:{}},instructions:remote.getInstructions()??'Read ouro.get_context first. Human decisions and DoD acceptance remain in Ouro.'});
  server.setRequestHandler(ListToolsRequestSchema,async()=>remote.listTools());
  server.setRequestHandler(CallToolRequestSchema,async(request)=>remote.callTool(request.params));
  await server.connect(new StdioServerTransport());
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await server?.close();await remote?.close();};
  server.onclose=()=>{void close();};
  process.on('SIGINT',()=>{void close().finally(()=>process.exit(0));});
  process.on('SIGTERM',()=>{void close().finally(()=>process.exit(0));});
}catch{
  process.stderr.write('Ouro MCP: connection failed. Check server availability, OURO_URL, and OURO_AGENT_TOKEN or OURO_AGENT_TOKEN_FILE. No credential is printed.\n');
  await server?.close();await remote?.close();process.exitCode=1;
}
