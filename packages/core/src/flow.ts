import type { FlowDefinition } from './types';
import {isWellFormedUnicode} from './unicode';

const invalid=(message:string):never=>{throw Object.assign(new Error(message),{code:'VALIDATION_ERROR'});};
const record=(value:unknown,label:string,keys:readonly string[]):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid(`${label}: требуется объект.`);
  const object=value as Record<string,unknown>;
  if(Object.keys(object).some(key=>!keys.includes(key)))invalid(`${label}: неизвестные поля запрещены.`);
  return object;
};
const text=(value:unknown,label:string,minimum=1,maximum=20_000):string=>{
  if(typeof value==='string'&&(!isWellFormedUnicode(value)||value.includes('\0')))invalid(`${label}: текст содержит непредставимые символы Unicode или NUL.`);
  if(typeof value!=='string'||value.trim().length<minimum||value.length>maximum)invalid(`${label}: требуется текст от ${minimum} до ${maximum} символов.`);
  return value as string;
};
const id=(value:unknown,label:string)=>text(value,label,1,200);

/** Structural process validation. It neither runs a workflow nor changes its snapshot. */
export function validateFlowDefinition(value:unknown):asserts value is FlowDefinition {
  const flow=record(value,'Схема',['entryNodeId','nodes','edges']);
  const entry=id(flow.entryNodeId,'Начальный узел');
  if(!Array.isArray(flow.nodes)||flow.nodes.length<1||flow.nodes.length>100)invalid('Схема должна содержать от 1 до 100 узлов.');
  if(!Array.isArray(flow.edges)||flow.edges.length>200)invalid('Схема должна содержать от 0 до 200 связей.');
  const kinds=new Set(['action','condition','question','fork','blocker','wait','result']);
  const owners=new Set(['human','agent','system']);
  const nodes=new Map<string,{kind:string}>();
  for(const item of flow.nodes as unknown[]){
    const node=record(item,'Узел',['id','kind','title','description','owner']);
    const nodeId=id(node.id,'ID узла');
    if(nodes.has(nodeId))invalid(`Повтор ID узла: ${nodeId}.`);
    const kind=text(node.kind,'Тип узла'),owner=text(node.owner,'Исполнитель узла');
    if(!kinds.has(kind)||!owners.has(owner))invalid('Неизвестный тип или исполнитель узла.');
    text(node.title,'Название узла');text(node.description,'Описание узла',0);
    if(['question','fork'].includes(kind)&&owner!=='human')invalid('Вопрос и развилка требуют выбора человека.');
    nodes.set(nodeId,{kind});
  }
  if(!nodes.has(entry))invalid('Начальный узел отсутствует в схеме.');
  const outgoing=new Map([...nodes.keys()].map(nodeId=>[nodeId,[] as {target:string;label:string}[]]));
  const incoming=new Map([...nodes.keys()].map(nodeId=>[nodeId,[] as string[]]));
  const edgeIds=new Set<string>(),links=new Set<string>(),forkOptions=new Map<string,Set<string>>();
  for(const item of flow.edges as unknown[]){
    const edge=record(item,'Связь',['id','source','target','label','optionId']);
    const edgeId=id(edge.id,'ID связи'),source=id(edge.source,'Начало связи'),target=id(edge.target,'Конец связи');
    const label=text(edge.label,'Подпись связи',0);
    const optionId=edge.optionId===undefined?undefined:id(edge.optionId,'ID варианта связи');
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
  // Reverse reachability permits retry cycles while rejecting a cycle without an exit.
  if(visit(results,nodeId=>incoming.get(nodeId)!).size!==nodes.size)invalid('Из каждого узла должен существовать путь к результату.');
}
