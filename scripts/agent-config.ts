import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAgentClientConfig,type AgentClientId} from '../lib/agent-client-config';

const help=`Ouro MCP client configuration

npm run --silent agent:config -- --client cursor|claude-code|claude-desktop|chatgpt --project-id PROJECT_ID --url PROJECT_MCP_URL --key-file ABSOLUTE_KEY_FILE

--entry prints one Claude Code server entry for claude mcp add-json.
The default output is the mcpServers wrapper. No settings files are changed.
Use the key file path; never pass the agent key value as a command argument.
`;
/** Печатает прежний CLI JSON; пути запуска внедряет доверенная source/installed composition. */
export function runAgentConfig({argv=process.argv.slice(2),stdioCommand=process.execPath,stdioArgs}:{argv?:string[];stdioCommand?:string;stdioArgs?:string[]}={}){
try{
 if(argv.length===1&&argv[0]==='--help')process.stdout.write(help);
 else{
  const accepted=new Set(['--client','--project-id','--url','--key-file']),values=new Map<string,string>();
  let entryOnly=false;
  for(let index=0;index<argv.length;index++){
   const option=argv[index];
   if(option==='--entry'){
    if(entryOnly)throw new Error('Параметр --entry указан повторно.');
    entryOnly=true;continue;
   }
   if(!accepted.has(option))throw new Error('Неизвестный параметр конфигурации. Используйте --help.');
   if(values.has(option)||!argv[index+1]||argv[index+1].startsWith('--'))throw new Error('Параметру требуется одно значение. Используйте --help.');
   values.set(option,argv[++index]);
  }
  if([...accepted].some(option=>!values.has(option)))throw new Error('Укажите client, project-id, url и key-file. Используйте --help.');
  const client=values.get('--client') as AgentClientId;
  if(entryOnly&&client!=='claude-code')throw new Error('--entry предназначен только для Claude Code.');
  const result=buildAgentClientConfig({client,keyFile:values.get('--key-file')!,connection:{projectId:values.get('--project-id')!,httpUrl:values.get('--url')!,stdioCommand,stdioArgs:stdioArgs??[path.join(path.dirname(path.dirname(path.resolve(process.argv[1]))),'packages/mcp/bin/ouro-mcp.mjs')]}});
  process.stdout.write(JSON.stringify(entryOnly?result.entry:result.config,null,2)+'\n');
 }return 0;
}catch(error){
 process.stderr.write(`Ouro: ${error instanceof Error?error.message:'Не удалось сформировать конфигурацию.'}\n`);
 return 1;
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runAgentConfig();
