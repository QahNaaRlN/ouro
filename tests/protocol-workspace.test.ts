import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv from 'ajv';

const contracts=()=>import('../packages/protocol/src/index');
test('PW07 standalone contract publishes bounded read-only workspace tools and concrete output DTOs',async()=>{
 const protocol=await contracts();
 const list=protocol.AGENT_TOOLS.find(tool=>tool.name==='ouro.list_workspace_files');
 const read=protocol.AGENT_TOOLS.find(tool=>tool.name==='ouro.read_workspace_file');
 assert(list,'Workspace listing tool is required');assert(read,'Workspace reading tool is required');
 assert.equal(protocol.AGENT_TOOLS.length,18);assert.equal(list.annotations.readOnlyHint,true);assert.equal(read.annotations.readOnlyHint,true);
 assert(list.inputSchema.safeParse({executionId:'execution'}).success);
 assert(read.inputSchema.safeParse({executionId:'execution',path:'README.md'}).success);
 for(const tool of [list,read])assert.equal(tool.inputSchema.safeParse({executionId:'execution',path:'README.md',projectId:'spoof'}).success,false);
 assert.equal(list.inputSchema.safeParse({executionId:'execution',cursor:-1}).success,false);
 assert.equal(read.inputSchema.safeParse({executionId:'execution'}).success,false);
 const listing=z.toJSONSchema(protocol.getToolSuccessSchema(list.name)) as any;
 const file=z.toJSONSchema(protocol.getToolSuccessSchema(read.name)) as any;
 assert.equal(listing.properties.entries.type,'array');assert.equal(listing.properties.entries.maxItems,200);
 assert.equal(file.properties.sha256.type,'string');assert.equal(file.properties.text.type,'string');
 const context=z.toJSONSchema(protocol.contextOutputSchema) as any;
 assert.equal(context.properties.workspace.properties.capabilities.properties.readOnlyFiles.const,true);
 assert.equal(context.properties.workspace.properties.rootPath,undefined);
});

test('PW07 workspace success/error schemas independently validate in canonical and SDK dialects',async()=>{
 const protocol=await contracts(),file={ok:true,projectId:'project',executionId:'execution',bindingId:'binding',path:'README.md',text:'Hello',sha256:'a'.repeat(64),size:5,modifiedAt:'2026-10-29T00:00:00Z'};
 const list={ok:true,projectId:'project',executionId:'execution',bindingId:'binding',path:'',entries:[{name:'README.md',path:'README.md',kind:'file',size:5}],nextCursor:null,truncated:false};
 const error={ok:false,error:{code:'NOT_AVAILABLE',message:'No bound folder.',retryable:false,refreshRequired:false}};
 for(const [name,body]of [['ouro.read_workspace_file',file],['ouro.list_workspace_files',list]] as const){
  assert.strictEqual(protocol.validateToolBody(name,body),body);assert.strictEqual(protocol.validateToolBody(name,error,true),error);
  for(const [validator,target]of [[new Ajv2020({strict:false}),'draft-2020-12'],[new Ajv({strict:false}),'draft-7']] as const){
   const validate=validator.compile(z.toJSONSchema(protocol.getToolOutputSchema(name),{target}));
   assert(validate(body),JSON.stringify(validate.errors));assert(validate(error),JSON.stringify(validate.errors));assert.equal(validate({ok:true,projectId:'project'}),false);
   if(name==='ouro.read_workspace_file'){assert.equal(validate({...file,size:131073}),false);assert.equal(validate({...file,sha256:'not-a-hash'}),false);}
   else assert.equal(validate({...list,entries:[{name:'x',path:'x',kind:'symlink'}]}),false);
  }
 }
});
