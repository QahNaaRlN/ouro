import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Actor } from '../../core/src/types';
import type { createStore } from '../../../lib/store';
import { createAgentService } from './agent-service';
import packageInfo from '../../../package.json';

export type McpDependencies = {
  store: Pick<Awaited<ReturnType<typeof createStore>>, 'getProject' | 'getEvents' | 'executeCommand'>;
  actor: Actor;
};

export function createOuroMcpServer(dependencies: McpDependencies) {
  const service=createAgentService(dependencies);
  const server=new McpServer({name:'ouro',version:packageInfo.version},{instructions:'Read ouro.get_context first. Work only on human-assigned executions and their immutable revisions. Question/Fork/Blocker require a human. Preserve requestId on retry; read context after version conflicts. Report actual evidence; human accepts DoD separately. Source-backed proposals remain interpretations until explicit human review; adoption creates only a draft.'});
  for(const tool of service.listTools()) {
    server.registerTool(tool.name,{title:tool.title,description:tool.description,inputSchema:tool.inputSchema,annotations:tool.annotations},async(args)=>({...await service.callTool(tool.name,args)}));
  }
  return server;
}
