import {flowShapeSchema,type FlowDefinition} from './flow-structure.js';

const invalid=(message:string):never=>{throw Object.assign(new Error(message),{code:'VALIDATION_ERROR'});};
const plainRecord=(value:unknown,label:string):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid(`${label}: требуется объект.`);
 return value as Record<string,unknown>;
};

/** Structural bounds share the exported schema. This never mutates the plan,
 * executes its steps, grants authority or treats paths as execution evidence.
 */
export function validateFlowDefinition(value:unknown):asserts value is FlowDefinition {
 const raw=plainRecord(value,'Схема');
 // Check raw prototypes before a ZodObject normalizes records into plain data.
 if(Array.isArray(raw.nodes))for(const node of raw.nodes)plainRecord(node,'Узел');
 if(Array.isArray(raw.edges))for(const edge of raw.edges)plainRecord(edge,'Связь');
 const parsed=flowShapeSchema.safeParse(value);
 if(!parsed.success){
  const issue=parsed.error.issues[0],path=issue.path.join('.')||'Схема';
  if(issue.code==='custom')invalid(`${path}: ${issue.message}`);
  if(issue.code==='unrecognized_keys')invalid(`${path}: неизвестные поля запрещены.`);
  return invalid(`${path}: неверный тип, значение или размер поля схемы.`);
 }
 const flow=parsed.data,entry=flow.entryNodeId;
 const nodes=new Map<string,{kind:string}>();
 for(const node of flow.nodes){
  if(nodes.has(node.id))invalid(`Повтор ID узла: ${node.id}.`);
  if(['question','fork'].includes(node.kind)&&node.owner!=='human')invalid('Вопрос и развилка требуют выбора человека.');
  nodes.set(node.id,{kind:node.kind});
 }
 if(!nodes.has(entry))invalid('Начальный узел отсутствует в схеме.');
 const outgoing=new Map([...nodes.keys()].map(nodeId=>[nodeId,[] as {target:string;label:string}[]]));
 const incoming=new Map([...nodes.keys()].map(nodeId=>[nodeId,[] as string[]]));
 const edgeIds=new Set<string>(),links=new Set<string>(),forkOptions=new Map<string,Set<string>>();
 for(const edge of flow.edges){
  const {id:edgeId,source,target,label,optionId}=edge;
  if(edgeIds.has(edgeId))invalid(`Повтор ID связи: ${edgeId}.`);
  if(!nodes.has(source)||!nodes.has(target))invalid('Концы связи должны существовать в этой схеме.');
  if(nodes.get(source)!.kind==='fork'&&optionId!==undefined){
   const options=forkOptions.get(source)??new Set<string>();
   if(options.has(optionId))invalid('Один вариант Fork должен обозначать только один исходящий путь.');
   options.add(optionId);forkOptions.set(source,options);
  }
  const key=JSON.stringify([source,target,label.trim().toLocaleLowerCase('ru-RU')]);
  if(links.has(key))invalid('Связь с такими узлами и исходом уже существует.');
  edgeIds.add(edgeId);links.add(key);outgoing.get(source)!.push({target,label});incoming.get(target)!.push(source);
 }
 const results:string[]=[];
 for(const [nodeId,node] of nodes){
  const exits=outgoing.get(nodeId)!;
  if(node.kind==='result'){
   results.push(nodeId);if(exits.length)invalid('Результат не может иметь исходящих связей.');
  }
  if(['condition','fork'].includes(node.kind)){
   const labels=exits.map(exit=>exit.label.trim().toLocaleLowerCase('ru-RU'));
   if(labels.length<2||labels.some(label=>!label)||new Set(labels).size!==labels.length)invalid('У условия и развилки нужны минимум два различимых подписанных исхода.');
  }
 }
 const visit=(initial:string[],neighbors:(nodeId:string)=>string[])=>{
  const visited=new Set<string>(),pending=[...initial];
  while(pending.length){const nodeId=pending.pop()!;if(visited.has(nodeId))continue;visited.add(nodeId);pending.push(...neighbors(nodeId));}
  return visited;
 };
 if(visit([entry],nodeId=>outgoing.get(nodeId)!.map(exit=>exit.target)).size!==nodes.size)invalid('Каждый узел должен быть достижим от начального узла.');
 // Retry cycles are valid when every node still has a route to a result.
 if(visit(results,nodeId=>incoming.get(nodeId)!).size!==nodes.size)invalid('Из каждого узла должен существовать путь к результату.');
}
