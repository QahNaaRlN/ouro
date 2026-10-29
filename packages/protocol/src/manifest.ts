import {z} from 'zod';
import {PROTOCOL_VERSION} from './version.js';
import {flowDefinitionSchema} from './flow.js';
import {agentProposalContentSchema,proposalRevisionContentSchema} from './inputs.js';
import {AGENT_TOOLS} from './tools.js';
import {agentErrorSchema,getToolOutputSchema} from './outputs.js';

export {PROTOCOL_VERSION} from './version.js';
export const JSON_SCHEMA_DIALECT='https://json-schema.org/draft/2020-12/schema' as const;
const definitions=[
 {name:'flow',file:'flow.schema.json',schema:flowDefinitionSchema},
 {name:'error',file:'error.schema.json',schema:agentErrorSchema},
 {name:'proposal-content',file:'proposal-content.schema.json',schema:agentProposalContentSchema},
 {name:'revision-content',file:'revision-content.schema.json',schema:proposalRevisionContentSchema},
 ...AGENT_TOOLS.flatMap(tool=>[
  {name:`input:${tool.name}`,file:`input-${tool.name}.schema.json`,schema:tool.inputSchema},
  {name:`output:${tool.name}`,file:`output-${tool.name}.schema.json`,schema:getToolOutputSchema(tool.name)},
 ]),
];
const schemaId=(name:string)=>`urn:ouro:protocol:${PROTOCOL_VERSION}:${name}`;
export const protocolManifest={
 name:'ouro-domain-contract',version:PROTOCOL_VERSION,dialect:JSON_SCHEMA_DIALECT,
 resources:{manifest:'ouro://protocol/manifest',schemas:'ouro://protocol/schemas'},
 tools:AGENT_TOOLS.map(tool=>({name:tool.name,inputSchema:schemaId(`input:${tool.name}`),outputSchema:schemaId(`output:${tool.name}`)})),
 errorSchema:schemaId('error'),
 schemas:definitions.map(({name,file})=>({name,id:schemaId(name),file})),
 compatibility:{supportedVersions:[PROTOCOL_VERSION],legacyToolArguments:true,mcpWireDialect:'draft-07',outputExtensions:'additional JSON properties are preserved; Flow and inputs remain closed'},
 semantics:[
  'JSON Schema checks structure. Application validation additionally checks references, reachability, authority, lifecycle and idempotency.',
  'Flow limits use legacy UTF-16 code units; JSON Schema maxLength counts Unicode code points. The portable semantic validator preserves the stricter legacy acceptance.',
  'Node/edge IDs are unique; all nodes are reachable from entry and can reach a result. Retry cycles with an exit are allowed.',
  'Question and fork nodes belong to the human. A plan, a decision and actual application are distinct facts.',
  'Event envelopes are typed; event payload and error details are JSON extension data in version 0.1.0, not a complete typed event catalog.',
  'A failed response after commit is an unknown outcome: preserve requestId and the exact body until the receipt is recovered.',
 ],
};

export function createSchemaBundle(){
 return {
  format:'ouro-protocol-bundle' as const,
  manifest:structuredClone(protocolManifest),
  schemas:definitions.map(({name,schema})=>({...z.toJSONSchema(schema,{target:'draft-2020-12',io:'input'}),$schema:JSON_SCHEMA_DIALECT,$id:schemaId(name)})),
 };
}

export function assertProtocolVersion(version:string):void{
 if(version!==PROTOCOL_VERSION)throw Object.assign(new Error(`Unsupported Ouro contract version: ${version}`),{code:'UNSUPPORTED_CONTRACT_VERSION'});
}
