import {PROJECT_ID} from '../packages/core/src/engine';
import {isWellFormedUnicode} from '../packages/core/src/unicode';

export type AgentClientId='cursor'|'claude-code'|'claude-desktop'|'chatgpt';
export type AgentConnection={projectId:string;httpUrl:string;stdioCommand:string;stdioArgs:string[]};
export type AgentMcpServerEntry={type?:'stdio';command:string;args:string[];env:{OURO_URL:string;OURO_AGENT_TOKEN_FILE:string}};
export type AgentClientConfiguration={serverName:string;entry:AgentMcpServerEntry;config:{mcpServers:Record<string,AgentMcpServerEntry>}};
export const AGENT_CLIENTS:readonly {id:AgentClientId;label:string}[]=[
 {id:'cursor',label:'Cursor'},{id:'claude-code',label:'Claude Code'},{id:'claude-desktop',label:'Claude Desktop'},{id:'chatgpt',label:'ChatGPT'},
];
export class AgentClientConfigError extends Error{
 readonly code='VALIDATION_ERROR';
 constructor(message:string){super(message);this.name='AgentClientConfigError';}
}
const invalid=(message:string):never=>{throw new AgentClientConfigError(message);};
const scalarText=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=4096&&isWellFormedUnicode(value)&&!/[\u0000-\u001f\u007f]/.test(value);
function absolutePath(value:unknown):value is string{
 // This browser-safe generator accepts fully qualified POSIX and Windows paths.
 // It does not resolve them on the server or infer the desktop client's OS.
 return scalarText(value)&&(value.startsWith('/')||/^[a-z]:[\\/]/i.test(value)||/^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value));
}
function validateConnection(connection:AgentConnection):void{
 if(!connection||!scalarText(connection.projectId)||!/^[a-z0-9][a-z0-9_-]{0,199}$/i.test(connection.projectId))invalid('Нужен корректный ID проекта для подключения.');
 if(!absolutePath(connection.stdioCommand)||!Array.isArray(connection.stdioArgs)||connection.stdioArgs.length===0||!absolutePath(connection.stdioArgs[0])||!Array.from(connection.stdioArgs).every(scalarText))invalid('Команда Node и путь stdio bridge должны быть абсолютными, без управляющих символов.');
 const supplied=connection.httpUrl;
 if(!scalarText(supplied)||!/^https?:\/\//i.test(supplied)||supplied.trim()!==supplied||/[?#]/.test(supplied)||/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(supplied))invalid('Нужен адрес MCP проекта без credentials, query и fragment.');
 let url:URL;try{url=new URL(supplied);}catch{throw new AgentClientConfigError('Нужен корректный адрес MCP проекта.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&local)))invalid('Удалённое подключение требует HTTPS; HTTP разрешён только на localhost.');
 const scoped=`/api/projects/${encodeURIComponent(connection.projectId)}/mcp`;
 if(url.pathname!==scoped&&!(connection.projectId===PROJECT_ID&&url.pathname==='/api/mcp'))invalid('Адрес MCP не соответствует выбранному проекту. Получите конфигурацию из его дашборда.');
}

/** Generate client JSON only. No credentials are read and no settings are edited. */
export function buildAgentClientConfig({client,connection,keyFile}:{client:AgentClientId;connection:AgentConnection;keyFile:string}):AgentClientConfiguration{
 if(!AGENT_CLIENTS.some(profile=>profile.id===client))invalid('Выберите поддерживаемый MCP-клиент.');
 if(!absolutePath(keyFile))invalid('Укажите абсолютный путь к файлу ключа агента без управляющих символов.');
 validateConnection(connection);
 const serverName=`ouro-${connection.projectId}`;
 const typed=client==='cursor'||client==='claude-code';
 const entry:AgentMcpServerEntry={...(typed?{type:'stdio' as const}:{}),command:connection.stdioCommand,args:[...connection.stdioArgs],env:{OURO_URL:connection.httpUrl,OURO_AGENT_TOKEN_FILE:keyFile}};
 return {serverName,entry,config:{mcpServers:{[serverName]:entry}}};
}
