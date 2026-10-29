import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Actor } from '../../core/src/types';
import type { createStore } from '../../../lib/store';
import { createAgentService } from './agent-service';
import packageInfo from '../../../package.json';
import {getToolOutputSchema,protocolManifest,createSchemaBundle} from '@ouro/protocol';

export type McpDependencies = {
  store: Pick<Awaited<ReturnType<typeof createStore>>, 'getProject' | 'getEvents' | 'executeCommand'>;
  actor: Actor;
};

export function createOuroMcpServer(dependencies: McpDependencies) {
  const service=createAgentService(dependencies);
  const server=new McpServer({name:'ouro',version:packageInfo.version},{instructions:'Read ouro.get_context first. Optional static contract resources are ouro://protocol/manifest and ouro://protocol/schemas. Work only on human-assigned executions and their immutable revisions. Question/Fork/Blocker require a human. Preserve requestId and the exact body on an unknown outcome; read context after version conflicts. Report actual evidence; human accepts DoD separately. Source-backed proposals remain interpretations until explicit human review; adoption creates only a draft.'});
  for(const tool of service.listTools()) {
    server.registerTool(tool.name,{title:tool.title,description:tool.description,inputSchema:tool.inputSchema,outputSchema:getToolOutputSchema(tool.name),annotations:tool.annotations},async(args)=>({...await service.callTool(tool.name,args)}));
  }
  server.registerResource('ouro-protocol-manifest','ouro://protocol/manifest',{title:'Ouro domain contract manifest',description:'Static protocol version, schema identifiers and compatibility boundaries. Contains no project data.',mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(protocolManifest)}]}));
  server.registerResource('ouro-protocol-schemas','ouro://protocol/schemas',{title:'Ouro JSON Schema bundle',description:'Portable Draft2020-12 input/output/Flow schemas and their manifest. Contains no project data.',mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(createSchemaBundle())}]}));
  return server;
}
