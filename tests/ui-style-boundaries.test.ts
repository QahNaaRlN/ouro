import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inventoryStyles, inspectStyles, type StyleLedger } from '../scripts/check-ui-styles.mjs';

/** Создаёт изолированный styling fixture без загрузки приложения. */
async function fixture(entries: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'ouro-style-gate-'));
  for (const [file, text] of Object.entries(entries)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
  const inventory = inventoryStyles(root);
  const ledger: StyleLedger = { contract: 'ouro-style-debt/v1', technicalCss: {}, css: inventory.css.map(record => ({ ...record, owner: 'fixture-family' })), inline: inventory.inline.map(record => ({ ...record, owner: 'fixture-family' })) };
  return { root, ledger, write: async (file: string, text: string) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }, close: async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('ouro-style-gate-')) throw new Error('Refused cleanup outside the owned fixture.');
    await rm(root, { recursive: true, force: true });
  } };
}

/** Формирует только явный fixture policy; checker никогда не создаёт approval record сам. */
async function technicalPolicy(root:string,file:string,dependencies:string[]=[]){
 const record=inventoryStyles(root).inline.find(value=>value.file===file);assert(record);
 return {...record,kind:'computed-geometry-custom-properties' as const,owner:'fixture-geometry',reason:'Reviewed synthetic measured geometry with finite custom properties.',dependencies:await Promise.all(dependencies.map(async file=>({file,sha256:createHash('sha256').update((await readFile(path.join(root,file),'utf8')).replace(/\r\n?/g,'\n')).digest('hex')})))};
}

test('STI01 final accepts an exact hashed relative geometry helper without changing legacy inventory bytes',async()=>{
 const f=await fixture({'components/geometry.ts':'export function variables(rect:{left:number}) {return {"--tour-left":`${rect.left}px`};}','components/view.tsx':'import {variables} from "./geometry"; throw Error("never execute"); export const View=({rect}:Props)=><div style={variables(rect)}/>;'});
 try{
  const before=JSON.stringify(inventoryStyles(f.root)),ledger={...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts'])]},result=inspectStyles({root:f.root,ledger,final:true});
  assert.deepEqual(result.violations,[]);assert.deepEqual(result.remaining,{cssFiles:0,inlineFiles:0});assert.equal(JSON.stringify(result.inventory),before);assert.equal(JSON.stringify(inventoryStyles(f.root)),before);
 }finally{await f.close();}
});

for(const [name,source]of [
 ['direct cast and conditional undefined','export const View=({rect}:Props)=><div style={rect ? ({"--left":`${rect.left}px`} as CSSProperties) : undefined}/>;'],
 ['same-file const initializer','export const View=({rect}:Props)=>{const variables=({"--left":`${rect.left}px`} satisfies CSSProperties);return <div style={variables}/>;};'],
 ['named local arrow helper','const variables=(rect:Rect)=>({"--left":`${Math.max(0,rect.left)}px`}); export const View=({rect}:Props)=><div style={variables(rect)}/>;'],
 ['simple helper local constant','function variables(rect:Rect){const measured={"--left":`${rect.left}px`};return measured;} export const View=({rect}:Props)=><div style={variables(rect)}/>;'],
 ['graph custom-property object','export function node(rect:Rect){return {style:{"--left":`${rect.left}px`}};}'],
 ['textarea auto and measured border height','export function resize(node:HTMLTextAreaElement){node.style.setProperty("--ouro-textarea-height","auto"); const css=getComputedStyle(node);const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);node.style.setProperty("--ouro-textarea-height",`${node.scrollHeight+borders}px`);}'],
] as const)test('STI02 final accepts bounded '+name,async()=>{
 const f=await fixture({'components/view.tsx':source});try{const ledger={...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx')]};assert.deepEqual(inspectStyles({root:f.root,ledger,final:true}).violations,[]);}finally{await f.close();}
});

for(const [name,source,helper]of [
 ['JSX object','export const View=()=> <div style={{"--padding":"20px"}}/>;',undefined],
 ['graph object','export const node={style:{"--width":20}};',undefined],
 ['DOM constant write','element.style.setProperty("--padding","20px");',undefined],
 ['cast const initializer','const variables=({"--padding":"20px"} as CSSProperties);export const View=()=> <div style={variables}/>;',undefined],
 ['local helper','function variables(rect:Rect){return {"--padding":"20px"};}export const View=({rect}:Props)=> <div style={variables(rect)}/>;',undefined],
 ['imported helper','import {variables} from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;','export function variables(rect:Rect){return {"--padding":"20px"};}'],
 ['constant Math calculation','export const View=()=> <div style={{"--width":`${Math.max(10,Math.min(30,20))}px`}}/>;',undefined],
 ['helper literal argument','function variables(rect:Rect){return {"--left":`${rect.left}px`};}export const View=()=> <div style={variables({left:20})}/>;',undefined],
 ['helper const argument','import {variables} from "./geometry";const fixed={left:20};export const View=()=> <div style={variables(fixed)}/>;','export function variables(rect:Rect){return {"--left":`${rect.left}px`};}'],
 ['runtime condition with static geometry','export const View=({flag}:Props)=> <div style={flag?{"--padding":"20px"}:undefined}/>;',undefined],
] as const)test('STI08 refuses static-only '+name+' disguised as computed geometry',async()=>{
 const entries:Record<string,string>={'components/view.tsx':source};if(helper)entries['components/geometry.ts']=helper;
 const f=await fixture(entries);try{const result=inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',helper?['components/geometry.ts']:[])]},final:true});assert(result.violations.length>0,name);assert.equal(result.remaining.inlineFiles,1);}finally{await f.close();}
});

for(const [name,source,helper]of [
 ['JSX','export const View=({width}:Props)=> <div style={{"--x":width,"--padding":"20px"}}/>;',undefined],
 ['graph','export function node(width:number){return {style:{"--x":width,"--padding":"20px"}};}',undefined],
 ['local helper','function variables(rect:Rect){return {"--x":`${rect.left}px`,"--padding":"20px"};}export const View=({rect}:Props)=> <div style={variables(rect)}/>;',undefined],
 ['imported helper','import {variables} from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;','export function variables(rect:Rect){return {"--x":`${rect.left}px`,"--padding":"20px"};}'],
] as const)test('STI09 measured '+name+' field cannot cover static presentation in the same object',async()=>{
 const entries:Record<string,string>={'components/view.tsx':source};if(helper)entries['components/geometry.ts']=helper;
 const f=await fixture(entries);try{const result=inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',helper?['components/geometry.ts']:[])]},final:true});assert(result.violations.length>0,name);assert.equal(result.remaining.inlineFiles,1);}finally{await f.close();}
});

test('STI02 resolves an explicitly hashed helper chain and exact duplicated-expression counts',async()=>{
 const f=await fixture({'components/inner.ts':'export const inner=(rect:Rect)=>({"--left":`${rect.left}px`});','components/geometry.ts':'import {inner} from "./inner"; export function variables(rect:Rect){return rect?inner(rect):undefined;}','components/view.tsx':'import {variables as measured} from "./geometry"; export const View=({rect}:Props)=><><div style={measured(rect)}/><div style={measured(rect)}/></>;'});
 try{const policy=await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts','components/inner.ts']);assert.equal(policy.expressions[0].count,2);assert.deepEqual(inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[policy]},final:true}).violations,[]);}finally{await f.close();}
});

test('STI02 recognizes the three reviewed tour-call shapes without approving a production file',async()=>{
 const f=await fixture({'components/geometry.ts':'export function tourRectVariables(rect:Rect){return {"--ouro-tour-left":`${rect.left}px`,"--ouro-tour-top":`${rect.top}px`,"--ouro-tour-width":`${rect.width}px`,"--ouro-tour-height":`${rect.height}px`};} export function tourCardVariables(geometry:Geometry|null){return geometry?{"--ouro-tour-left":`${geometry.card.left}px`,"--ouro-tour-top":`${geometry.card.top}px`,"--ouro-tour-width":`${Math.max(0,Math.min(360,geometry.view.width-32))}px`,"--ouro-tour-max-width":`${Math.max(0,geometry.view.width-32)}px`,"--ouro-tour-max-height":`${Math.max(0,geometry.view.height-32)}px`}:undefined;}','components/view.tsx':'import {tourRectVariables,tourCardVariables} from "./geometry";export const View=({pane,highlight,geometry}:Props)=><><div style={tourRectVariables(pane)}/><div style={tourRectVariables(highlight)}/><section style={tourCardVariables(geometry)}/></>;'});
 try{const policy=await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts']);assert.equal(policy.expressions.length,3);assert.deepEqual(inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[policy]},final:true}).violations,[]);}finally{await f.close();}
});

for(const body of ['return {color:"red"};','return rect?{"--left":"10px"}:{padding:20};','return unknownGeometry(rect);'])test('STI03 hashed named helper still refuses '+body,async()=>{
 const f=await fixture({'components/geometry.ts':'export function variables(rect:Rect){'+body+'}','components/view.tsx':'import {variables} from "./geometry";export const View=({rect}:Props)=><div style={variables(rect)}/>;'});
 try{const result=inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts'])]},final:true});assert(result.violations.length>0);assert.equal(result.remaining.inlineFiles,1);}finally{await f.close();}
});

for(const [name,source]of [
 ['ordinary color','export const View=()=> <div style={{color:"red"}}/>;'],
 ['ordinary padding','export const View=()=> <div style={{padding:20}}/>;'],
 ['custom property with color value','export const View=()=> <div style={{"--color":"red"}}/>;'],
 ['spread','const other={"--left":"10px"};export const View=()=> <div style={{...other}}/>;'],
 ['computed key','export const View=()=> <div style={{["--left"]:"10px"}}/>;'],
 ['duplicate object key','export const View=()=> <div style={{"--left":"10px","--left":"20px"}}/>;'],
 ['unknown function','export const View=()=> <div style={unknownGeometry()}/>;'],
 ['unknown value function','export const View=()=> <div style={{"--left":`${unknownGeometry()}px`}}/>;'],
 ['unknown nested function','export const View=()=> <div style={{"--left":`${Math.max(0,unknownGeometry())}px`}}/>;'],
 ['unknown conditional function','export const View=()=> <div style={unknownGeometry()?{"--left":"10px"}:undefined}/>;'],
 ['unknown helper argument','const variables=(rect:Rect)=>({"--left":`${rect.left}px`});export const View=()=> <div style={variables(unknownGeometry())}/>;'],
 ['namespace helper','import * as geometry from "./geometry";export const View=({rect}:Props)=> <div style={geometry.variables(rect)}/>;'],
 ['default helper','import variables from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;'],
 ['ambiguous shadowed helper','const variables=(rect:Rect)=>({"--left":`${rect.left}px`});function other(variables:unknown){} export const View=({rect}:Props)=> <div style={variables(rect)}/>;'],
 ['destructured shadowed helper','const variables=(rect:Rect)=>({"--left":`${rect.left}px`});export function View({variables,rect}:Props){return <div style={variables(rect)}/>;}'],
 ['destructuring reassigned helper','function variables(rect:Rect){return {"--left":`${rect.left}px`};}({variables}=unknownSource);export const View=({rect}:Props)=> <div style={variables(rect)}/>;'],
 ['mutable initializer','let variables={"--left":"10px"};export const View=()=> <div style={variables}/>;'],
 ['mutated object','const variables={"--left":"10px"};variables.color="red";export const View=()=> <div style={variables}/>;'],
 ['aliased mutable object','const variables={"--left":"10px"};const alias=variables;alias.color="red";export const View=()=> <div style={variables}/>;'],
 ['escaped object','const variables={"--left":"10px"};mutate(variables);export const View=()=> <div style={variables}/>;'],
 ['local cycle','const variables=other;const other=variables;export const View=()=> <div style={variables}/>;'],
 ['ordinary DOM assignment','element.style.height="20px";'],
 ['ordinary DOM property','element.style.setProperty("padding","20px");'],
 ['important priority','element.style.setProperty("--height","20px","important");'],
 ['computed DOM property name','const key="--height";element.style.setProperty(key,"20px");'],
 ['cssText','element.style.cssText="height:20px";'],
 ['style attribute','element.setAttribute("style","--height:20px");'],
 ['Object.assign','Object.assign(element.style,{"--height":"20px"});'],
 ['parseFloat unknown nested source','element.style.setProperty("--height",`${parseFloat(readStyle().borderTopWidth)}px`);'],
] as const)test('STI03 refuses '+name+' under a technical label',async()=>{
 const f=await fixture({'components/view.tsx':source,'components/geometry.ts':(name.includes('default helper')?'export default':'export')+' function variables(rect:Rect){return {"--left":`${rect.left}px`};}'});
 try{const result=inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',name.includes('namespace')||name.includes('default helper')?['components/geometry.ts']:[])]},final:true});assert(result.violations.length>0,name);assert.equal(result.remaining.inlineFiles,1);}finally{await f.close();}
});

test('STI04 refuses a cycle between explicitly hashed external helpers',async()=>{
 const f=await fixture({'components/geometry.ts':'import {inner} from "./inner";export function variables(rect:Rect){return inner(rect);}','components/inner.ts':'import {variables} from "./geometry";export function inner(rect:Rect){return variables(rect);}','components/view.tsx':'import {variables} from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;'});
 try{const result=inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts','components/inner.ts'])]},final:true});assert.match(result.violations.join('\n'),/technical inline/);}finally{await f.close();}
});

test('STI05 technical approval cannot hide ordinary residue or auto-promote old owned expressions',async()=>{
 const f=await fixture({'components/view.tsx':'export const View=({rect}:Props)=> <div style={{"--left":`${rect.left}px`}}/>;','components/ordinary.css':'.panel {color:red}'});
 try{
  const id=f.ledger.inline[0].expressions[0].sha256;
  await f.write('components/view.tsx','export const View=({rect}:Props)=> <><div style={{"--left":`${rect.left}px`}}/><div style={{color:"red"}}/></>;');
  const policy=await technicalPolicy(f.root,'components/view.tsx');assert.equal(policy.expressions.length,2);policy.expressions=policy.expressions.filter(value=>value.sha256===id);assert.equal(policy.expressions.length,1);
  const current=inventoryStyles(f.root).inline[0],ordinary={...current,owner:'fixture-ordinary',expressions:current.expressions.filter(value=>value.sha256!==id)},ledger={...f.ledger,inline:[ordinary],technicalInline:[policy]};
  const regular=inspectStyles({root:f.root,ledger});assert.deepEqual(regular.violations,[]);assert.deepEqual(regular.remaining,{cssFiles:1,inlineFiles:1});assert.match(inspectStyles({root:f.root,ledger,final:true}).violations.join('\n'),/Unfinished ordinary/);
  const overlap=inspectStyles({root:f.root,ledger:{...ledger,inline:[{...current,owner:'fixture-ordinary'}]}});assert.match(overlap.violations.join('\n'),/technical inline/);
 }finally{await f.close();}
});

test('STI06 context and exact counts reject same-file additions even after only the context hash is refreshed',async()=>{
 for(const addition of ['<div style={{color:"red"}}/>','<div style={{"--left":`${rect.left}px`}}/>']){
  const f=await fixture({'components/view.tsx':'export const View=({rect}:Props)=> <div style={{"--left":`${rect.left}px`}}/>;'});
  try{
   const policy=await technicalPolicy(f.root,'components/view.tsx'),ledger={...f.ledger,inline:[],technicalInline:[policy]};
   assert.deepEqual(inspectStyles({root:f.root,ledger,final:true}).violations,[]);
   await f.write('components/view.tsx','export const View=({rect}:Props)=> <><div style={{"--left":`${rect.left}px`}}/>'+addition+'</>;');
   assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0,'Original whole-file context must fail.');
   policy.sha256=inventoryStyles(f.root).inline[0].sha256;
   assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0,'A refreshed context cannot approve a new expression or duplicate an approved one.');
  }finally{await f.close();}
 }
});

test('STI06 helper content changes and missing/stale files invalidate exact technical policies',async()=>{
 const f=await fixture({'components/geometry.ts':'export function variables(rect:Rect){return {"--left":`${rect.left}px`};}','components/view.tsx':'import {variables} from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;'});
 try{
  const policy=await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts']),ledger={...f.ledger,inline:[],technicalInline:[policy]};
  assert.deepEqual(inspectStyles({root:f.root,ledger,final:true}).violations,[]);
  await f.write('components/geometry.ts','export function variables(rect:Rect){return {"--left":`${rect.left+1}px`};}');assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0);
  await rm(path.join(f.root,'components/geometry.ts'));assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0);
  await rm(path.join(f.root,'components/view.tsx'));assert.match(inspectStyles({root:f.root,ledger,final:true}).violations.join('\n'),/Stale technical inline/);
 }finally{await f.close();}
});

for(const [name,change]of [
 ['missing count',(value:Record<string,unknown>)=>Reflect.deleteProperty((value.expressions as Record<string,unknown>[])[0],'count')],
 ['wrong count',(value:Record<string,unknown>)=>{(value.expressions as Record<string,unknown>[])[0].count=2;}],
 ['unknown expression kind',(value:Record<string,unknown>)=>{(value.expressions as Record<string,unknown>[])[0].kind='anything';}],
 ['duplicate expression',(value:Record<string,unknown>)=>{(value.expressions as unknown[]).push((value.expressions as unknown[])[0]);}],
 ['missing dependencies',(value:Record<string,unknown>)=>Reflect.deleteProperty(value,'dependencies')],
 ['undeclared helper',(value:Record<string,unknown>)=>{value.dependencies=[];}],
 ['changed dependency hash',(value:Record<string,unknown>)=>{(value.dependencies as Record<string,unknown>[])[0].sha256='0'.repeat(64);}],
 ['duplicate dependency',(value:Record<string,unknown>)=>{(value.dependencies as unknown[]).push((value.dependencies as unknown[])[0]);}],
 ['unused dependency',(value:Record<string,unknown>)=>{(value.dependencies as unknown[]).push({file:'components/unused.ts',sha256:'0'.repeat(64)});}],
 ['glob',(value:Record<string,unknown>)=>{value.file='components/*.tsx';}],
 ['dependency glob',(value:Record<string,unknown>)=>{(value.dependencies as Record<string,unknown>[])[0].file='components/*.ts';}],
 ['path escape',(value:Record<string,unknown>)=>{(value.dependencies as Record<string,unknown>[])[0].file='../outside.ts';}],
 ['unknown category',(value:Record<string,unknown>)=>{value.kind='all-inline';}],
 ['missing owner',(value:Record<string,unknown>)=>{value.owner=' ';}],
 ['missing reason',(value:Record<string,unknown>)=>{value.reason=' ';}],
 ['stale context',(value:Record<string,unknown>)=>{value.sha256='0'.repeat(64);}],
 ['unknown field',(value:Record<string,unknown>)=>{value.allowAll=true;}],
] as const)test('STI07 refuses '+name+' policy metadata',async()=>{
 const f=await fixture({'components/geometry.ts':'export function variables(rect:Rect){return {"--left":`${rect.left}px`};}','components/unused.ts':'export const unused=1;','components/view.tsx':'import {variables} from "./geometry";export const View=({rect}:Props)=> <div style={variables(rect)}/>;'});
 try{const value=structuredClone(await technicalPolicy(f.root,'components/view.tsx',['components/geometry.ts'])) as Record<string,unknown>;change(value);const ledger={...f.ledger,inline:[],technicalInline:[value]} as unknown as StyleLedger;assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0,name);}finally{await f.close();}
});

test('STI07 duplicate file approvals and malformed policy arrays never pass final mode',async()=>{
 const f=await fixture({'components/view.tsx':'export const View=({rect}:Props)=> <div style={{"--left":`${rect.left}px`}}/>;'});
 try{const policy=await technicalPolicy(f.root,'components/view.tsx');assert.deepEqual(inspectStyles({root:f.root,ledger:{...f.ledger,inline:[],technicalInline:[policy]},final:true}).violations,[]);for(const technicalInline of [[policy,policy],{},null]){const ledger={...f.ledger,inline:[],technicalInline} as unknown as StyleLedger;assert(inspectStyles({root:f.root,ledger,final:true}).violations.length>0);}}finally{await f.close();}
});

test('SMG01 inventories modules, JSX, graph styles and imperative writes without executing source', async () => {
  const f = await fixture({ 'app/view.module.css': '.panel {color:red}', 'components/view.tsx': "throw Error('never execute'); const node={style:{width:210},labelStyle:{fill:'red'}}; const view=<div style={{color:'blue'}}/>; element.style.height='10px';" });
  try {
    const actual = inventoryStyles(f.root);
    assert.equal(actual.css.length, 1); assert.equal(actual.inline.length, 1);
    assert.deepEqual(actual.inline[0].expressions.map(value => value.kind).sort(), ['dom', 'graph', 'graph', 'jsx']);
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
  } finally { await f.close(); }
});

test('SMG02 rejects new CSS and inline declarations outside the exact owned ledger', async () => {
  const f = await fixture({});
  try {
    await f.write('components/new.module.css', '.panel {color:red}');
    await f.write('components/view.tsx', 'export const View=()=> <div style={{color:"red"}}/>;');
    const issues = inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n');
    assert.match(issues, /new\.module\.css/); assert.match(issues, /view\.tsx/);
  } finally { await f.close(); }
});

test('SMG02 rejects changed and stale styling debt, including referenced same-file constants', async () => {
  const f = await fixture({ 'app/old.css': '.old {color:red}', 'components/view.tsx': 'const recipe={color:"red"}; export const View=()=> <div style={recipe}/>;' });
  try {
    await f.write('components/view.tsx', 'const recipe={color:"blue"}; export const View=()=> <div style={recipe}/>;');
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /view\.tsx/);
    await rm(path.join(f.root, 'app/old.css'));
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /stale.*old\.css/i);
  } finally { await f.close(); }
});

test('SMG03 does not permit component styling under a technical theme/base label or @apply', async () => {
  const f = await fixture({ 'app/theme.css': '.panel {padding:20px}', 'app/old.css': '.old {@apply flex px-4}' });
  try {
    f.ledger.technicalCss['app/theme.css'] = { kind: 'base-theme', reason: 'Fixture base palette' };
    f.ledger.css = f.ledger.css.filter(value => value.file !== 'app/theme.css');
    const issues = inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n');
    assert.match(issues, /technical.*theme\.css/i); assert.match(issues, /@apply/);
  } finally { await f.close(); }
});

test('SMG03 accepts only minimal base and Tailwind directives as technical residue', async () => {
  const f = await fixture({ 'app/theme.css': ':root {--bg:#fff;color-scheme:light} html,body {margin:0;color:var(--text);font-size:14px}', 'app/tailwind.css': '@layer theme,base,utilities; @import "tailwindcss/theme.css" layer(theme); @source "../components"; @theme inline {--color-ouro-bg:var(--bg)}' });
  try {
    f.ledger.css = [];
    f.ledger.technicalCss = { 'app/theme.css': { kind: 'base-theme', reason: 'Document defaults' }, 'app/tailwind.css': { kind: 'tailwind', reason: 'Tailwind entry' } };
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.length, 0);
    await f.write('app/theme.css', 'body {padding:24px}');
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /technical/);
  } finally { await f.close(); }
});

test('SMG04 final mode refuses known ordinary styles and any transitional legacy layer', async () => {
  const f = await fixture({ 'app/old.css': '.old {color:red}', 'app/tailwind.css': '@layer theme,ouro-legacy,utilities;' });
  try {
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
    const issues = inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.join('\n');
    assert.match(issues, /unfinished|ordinary/i); assert.match(issues, /legacy/i);
  } finally { await f.close(); }
});

test('SMG02 exact dynamic-route paths are records, while wildcard policies cannot hide additions', async () => {
  const f = await fixture({ 'app/projects/[projectId]/old.css': '.old {color:red}' });
  try {
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
    f.ledger.css[0].file = 'app/projects/*/old.css';
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /Invalid|Unowned/);
  } finally { await f.close(); }
});

test('SMG01 unverified source junctions cannot make final mode silently miss external CSS', async () => {
  const f = await fixture({}), external = await mkdtemp(path.join(tmpdir(), 'ouro-style-external-'));
  const link = path.join(f.root, 'app/linked');
  let linked = false;
  try {
    await writeFile(path.join(external, 'ordinary.css'), '.panel {color:red}');
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(external, link, 'junction'); linked = true;
    assert.throws(() => inspectStyles({ root: f.root, ledger: f.ledger, final: true }), /symbolic|junction/i);
  } finally {
    if (linked) await unlink(link);
    await f.close();
    if (path.dirname(path.resolve(external)) !== path.resolve(tmpdir()) || !path.basename(external).startsWith('ouro-style-external-')) throw new Error('Refused cleanup outside the owned external fixture.');
    await rm(external, { recursive: true, force: true });
  }
});

for (const [name, source] of [
  ['shorthand JSX spread', 'const style={color:"red"}; const View=()=> <div {...{style}}/>;'],
  ['literal computed style access', 'element["style"].color="red";'],
  ['Object.assign style target', 'Object.assign(element.style,{color:"red"});'],
  ['direct style assignment', 'element.style="color:red";'],
  ['namespaced style attribute', 'element.setAttributeNS(null,"style","color:red");'],
] as const) test('SMG01 detects ' + name + ' without general dataflow analysis', async () => {
  const f = await fixture({});
  try {
    await f.write('components/view.tsx', source);
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.join('\n'), /inline styling/);
  } finally { await f.close(); }
});
