import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildAgentClientConfig,type AgentClientId,type AgentConnection} from '../lib/agent-client-config';

const projectId='a4b82f1d-6bcd-4fb4-899c-b0a7b01a34f1',legacyProjectId='6c7c62dc-694c-4c7b-9cb1-d9e605164001';
const connection:AgentConnection={projectId,httpUrl:`http://127.0.0.1:3000/api/projects/${projectId}/mcp`,stdioCommand:'/usr/bin/node',stdioArgs:['/home/operator/Ouro setup/packages/mcp/bin/ouro-mcp.mjs']};
const input=(client:AgentClientId='cursor')=>({client,connection:structuredClone(connection),keyFile:'/home/operator/private/ouro-agent.key'});

test('CO01 client profiles produce the documented Cursor/Claude Code/Desktop stdio shapes',()=>{
 for(const client of ['cursor','claude-code','claude-desktop','chatgpt'] as const){
  const result=buildAgentClientConfig(input(client));
  assert.equal(result.entry.type,client==='cursor'||client==='claude-code'?'stdio':undefined);
  assert.deepEqual(result.config,{mcpServers:{[result.serverName]:result.entry}});
  assert.deepEqual(Object.keys(result.entry).sort(),client==='cursor'||client==='claude-code'?['args','command','env','type']:['args','command','env']);
  assert.deepEqual(result.entry.env,{OURO_URL:connection.httpUrl,OURO_AGENT_TOKEN_FILE:input().keyFile});
 }
});

test('CO01 different projects with identical short prefixes never replace the same MCP server entry',()=>{
 const a=buildAgentClientConfig(input()),otherId=projectId.slice(0,-1)+'2';
 const b=buildAgentClientConfig({...input(),connection:{...connection,projectId:otherId,httpUrl:`http://127.0.0.1:3000/api/projects/${otherId}/mcp`}});
 assert.notEqual(a.serverName,b.serverName);assert.equal(a.serverName,`ouro-${projectId}`);
 assert.equal(Object.keys({...a.config.mcpServers,...b.config.mcpServers}).length,2);
});

test('CO02 exact POSIX/Windows/UNC paths survive JSON with Unicode and no token value or input mutation',()=>{
 const candidates=[
  {stdioCommand:'/opt/Node runtime/node',stdioArgs:["/home/Оператор/Ouro's project/bridge.mjs"],keyFile:"/home/Оператор/private/Ouro's key 😀.txt"},
  {stdioCommand:'C:\\Program Files\\nodejs\\node.exe',stdioArgs:['C:\\Работа\\ouro project\\bridge.mjs'],keyFile:'C:\\Users\\Оператор\\private\\ouro.key'},
  {stdioCommand:'\\\\machine\\share\\node.exe',stdioArgs:['\\\\machine\\share\\bridge.mjs'],keyFile:'\\\\machine\\private\\ouro.key'},
 ];
 for(const paths of candidates){
  const candidate={...input(),connection:{...connection,stdioCommand:paths.stdioCommand,stdioArgs:paths.stdioArgs},keyFile:paths.keyFile,token:'NEVER-IN-EXPORTED-CONFIG'};
  const before=structuredClone(candidate),result=buildAgentClientConfig(candidate),wire=JSON.stringify(result.config),entry=JSON.parse(wire).mcpServers[result.serverName];
  assert.equal(entry.command,paths.stdioCommand);assert.deepEqual(entry.args,paths.stdioArgs);assert.equal(entry.env.OURO_AGENT_TOKEN_FILE,paths.keyFile);
  assert.equal(wire.includes(candidate.token),false);assert.deepEqual(candidate,before);assert.notEqual(result.entry.args,candidate.connection.stdioArgs);
 }
});

test('CO02 unsupported profiles and unusable key paths reject instead of exporting a broken connection',()=>{
 for(const client of ['claude','unknown','',null])assert.throws(()=>buildAgentClientConfig({...input(),client:client as AgentClientId}));
 for(const keyFile of ['', 'private/ouro.key','~/private/ouro.key','C:relative.key','\\rooted.key',' /private/key','/private/\u0000key','/private/\nkey','/private/\ud800']){
  assert.throws(()=>buildAgentClientConfig({...input(),keyFile}),`Must reject ${JSON.stringify(keyFile)}`);
 }
});

test('CO02 credentials, unsafe transport URLs and a different project endpoint never enter a client configuration',()=>{
 for(const httpUrl of [
  'not-a-url',connection.httpUrl+'?token=PRIVATE-INPUT',connection.httpUrl+'#PRIVATE-INPUT',connection.httpUrl.replace('127.0.0.1','PRIVATE-INPUT@127.0.0.1'),
  connection.httpUrl.replace('127.0.0.1','remote.example'),connection.httpUrl.replace('http:','file:'),connection.httpUrl.replace(projectId,projectId.slice(0,-1)+'2'),
  'http://127.0.0.1:3000/api/mcp',connection.httpUrl+'/',connection.httpUrl.replace('/api/projects/','/wrong/'),
 ])assert.throws(()=>buildAgentClientConfig({...input(),connection:{...connection,httpUrl}}),error=>error instanceof Error&&!error.message.includes('PRIVATE-INPUT'));
 for(const origin of ['http://localhost:3001','http://[::1]:3000','https://ouro.example']){
  const httpUrl=`${origin}/api/projects/${projectId}/mcp`;assert.equal(buildAgentClientConfig({...input(),connection:{...connection,httpUrl}}).entry.env.OURO_URL,httpUrl);
 }
 const legacy={...connection,projectId:legacyProjectId,httpUrl:'http://localhost:3000/api/mcp'};
 assert.equal(buildAgentClientConfig({...input(),connection:legacy}).entry.env.OURO_URL,legacy.httpUrl);
});

test('CO02 a client never receives a relative Node or bridge executable or malformed argv',()=>{
 const sparseArgs=new Array<string>(2);sparseArgs[0]='/bridge.mjs';
 for(const bad of [{stdioCommand:'node'},{stdioCommand:''},{stdioCommand:'/node\nPRIVATE-INPUT'},{stdioArgs:[]},{stdioArgs:['relative/bridge.mjs']},{stdioArgs:['/bridge\u0000PRIVATE-INPUT']},{stdioArgs:['/bridge.mjs',123]},{stdioArgs:sparseArgs}]){
  assert.throws(()=>buildAgentClientConfig({...input(),connection:{...connection,...bad} as AgentConnection}),error=>error instanceof Error&&!error.message.includes('PRIVATE-INPUT'));
 }
});

test('CO06 CLI prints wrapper or Claude Code entry using the same factory without writing client files',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ouro-client-cli-'));
 const run=(args:string[])=>spawnSync(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),path.resolve('scripts/agent-config.ts'),...args],{cwd:directory,encoding:'utf8',env:{...process.env,OURO_AGENT_TOKEN:'NEVER-IN-EXPORTED-CONFIG'},timeout:15000});
 const common=['--project-id',projectId,'--url',connection.httpUrl,'--key-file',"/private/Агент's key.txt"];
 try{
  for(const client of ['cursor','claude-code','claude-desktop','chatgpt']){
   const result=run(['--client',client,...common]);assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout),[name]=Object.keys(parsed.mcpServers);
   assert.equal(name,`ouro-${projectId}`);assert.equal(parsed.mcpServers[name].command,process.execPath);assert.deepEqual(parsed.mcpServers[name].args,[path.resolve('packages/mcp/bin/ouro-mcp.mjs')]);
   assert.equal(parsed.mcpServers[name].env.OURO_AGENT_TOKEN_FILE,common.at(-1));assert.equal(result.stdout.includes('NEVER-IN-EXPORTED-CONFIG'),false);
  }
  const entry=run(['--client','claude-code',...common,'--entry']);assert.equal(entry.status,0,entry.stderr);assert.equal(JSON.parse(entry.stdout).type,'stdio');assert.equal('mcpServers' in JSON.parse(entry.stdout),false);
  for(const args of [['--client','cursor',...common,'--entry'],['--client','no-client',...common],['--client','cursor',...common,'--token','PRIVATE-INPUT'],['--client','cursor','--url',connection.httpUrl]]){
   const result=run(args);assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr.includes('PRIVATE-INPUT'),false);
  }
  assert.deepEqual(await readdir(directory),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
