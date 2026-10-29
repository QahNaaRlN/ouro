import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';
import {AGENT_TOOLS} from '../packages/mcp/src/tools';
import {validateFlowDefinition as validateCoreFlow} from '../packages/core/src/flow';

const example=()=>({entryNodeId:'read',nodes:[
 {id:'read',kind:'action',title:'Изучить вход 👩🏽‍💻',description:'',owner:'agent'},
 {id:'choice',kind:'fork',title:'Выбрать путь',description:'Решает человек.',owner:'human'},
 {id:'result',kind:'result',title:'Предъявить результат',description:'',owner:'agent'},
],edges:[
 {id:'read-choice',source:'read',target:'choice',label:'Контекст изучен'},
 {id:'retry',source:'choice',target:'read',label:'Нужна повторная проверка',optionId:'retry'},
 {id:'finish',source:'choice',target:'result',label:'Предъявить',optionId:'finish'},
]});

test('P01 public proposal Flow is a concrete independently usable JSON Schema',()=>{
 const tool=AGENT_TOOLS.find(tool=>tool.name==='ouro.submit_proposal')!;
 const exported=z.toJSONSchema(tool.inputSchema,{target:'draft-2020-12'}) as any;
 const proposal=exported.properties.content.oneOf.find((item:any)=>item.properties.kind.const==='spec_proposal');
 const flow=proposal.properties.draft.properties.flow;
 assert.equal(flow.type,'object','Flow must expose its object shape, not opaque {}');
 assert.equal(flow.additionalProperties,false);
 assert.equal(flow.properties.nodes.maxItems,100);assert.equal(flow.properties.edges.maxItems,200);
 assert.deepEqual(flow.properties.nodes.items.properties.kind.enum,['action','condition','question','fork','blocker','wait','result']);
 assert.deepEqual(flow.properties.nodes.items.properties.owner.enum,['human','agent','system']);
 assert.equal(flow.properties.edges.items.additionalProperties,false);
 const validate=new Ajv2020({strict:false}).compile(flow);
 assert.equal(validate(example()),true,JSON.stringify(validate.errors));
 const unknown=example();Object.assign(unknown.nodes[0],{approveAutomatically:true});
 assert.equal(validate(unknown),false);
 const invalidKind=example();invalidKind.nodes[0].kind='free-form';assert.equal(validate(invalidKind),false);
 // JSON Schema describes structure. Existing-node references are graph rules
 // enforced by the portable validator rather than guessed by a JSON parser.
 const brokenReference=example();brokenReference.edges[0].target='missing';assert.equal(validate(brokenReference),true);
});

test('P01 portable Flow semantics retain legacy loops, ownership, references and exact Unicode boundaries',async()=>{
 const portable:typeof import('../packages/protocol/src/flow')=await import('../packages/protocol/src/flow');
 const accepted=example(),copy=structuredClone(accepted);
 portable.validateFlowDefinition(accepted);validateCoreFlow(accepted);assert.deepEqual(accepted,copy);
 assert.equal(portable.flowDefinitionSchema.safeParse(accepted).success,true);
 const variants:unknown[]=[];
 const alter=(change:(value:ReturnType<typeof example>)=>void)=>{const value=example();change(value);variants.push(value);};
 alter(value=>value.edges[0].target='missing');
 alter(value=>value.nodes[1].owner='agent');
 alter(value=>value.edges[2].optionId='retry');
 alter(value=>value.edges=value.edges.filter(edge=>edge.target!=='result'));
 alter(value=>value.nodes[0].title='\ud800');
 alter(value=>value.nodes[0].title='contains\u0000NUL');
 alter(value=>value.nodes[0].id='🙂'.repeat(101));
 for(const value of variants){
  assert.throws(()=>portable.validateFlowDefinition(value),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
  assert.throws(()=>validateCoreFlow(value),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
  assert.equal(portable.flowDefinitionSchema.safeParse(value).success,false);
 }
 // Prototype checks belong to the raw-JS validator. JSON/MCP values cannot
 // carry a class prototype, and a concrete ZodObject normalizes its records.
 const instance=new(class{entryNodeId=accepted.entryNodeId;nodes=accepted.nodes;edges=accepted.edges})();
 assert.throws(()=>portable.validateFlowDefinition(instance),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
 assert.throws(()=>validateCoreFlow(instance),(error:unknown)=>(error as {code?:string}).code==='VALIDATION_ERROR');
 const boundary=example(),id='🙂'.repeat(100);boundary.nodes[0].id=id;boundary.entryNodeId=id;
 boundary.edges=boundary.edges.map(edge=>({...edge,source:edge.source==='read'?id:edge.source,target:edge.target==='read'?id:edge.target}));
 assert.equal(portable.flowDefinitionSchema.safeParse(boundary).success,true);
});
