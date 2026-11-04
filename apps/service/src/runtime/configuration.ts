import path from 'node:path';
import {tmpdir} from 'node:os';

/** Валидированные пути и authority runtime, независимые от рабочего каталога процесса. */
export type RuntimeConfiguration={environment:Record<string,string|undefined>;host:string;port:number;dataDir?:string;databaseUrl?:string;resourceRoot:string;migrationsDir:string;mcpPath:string;verificationRuntimeDir:string;packageRoot:string;staticRoot?:string;shutdownTimeoutMs:number};

/** Проверяет конфигурацию до открытия БД; запуск без явного storage profile запрещён. */
export function runtimeConfiguration(environment:Record<string,string|undefined>,options:{resourceRoot:string;migrationsDir?:string;packageRoot?:string;mcpPath?:string}):RuntimeConfiguration{
 const env={...environment},resourceRoot=path.resolve(options.resourceRoot);
 const host=env.OURO_SERVICE_HOST??'127.0.0.1',port=Number(env.PORT??'3000');
 const loopback=['127.0.0.1','localhost','::1'].includes(host),hosted=env.OURO_DEPLOYMENT_MODE==='cloud';
 if(!Number.isSafeInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer from 0 to 65535.');
 if(!host||/[\s/\\\u0000-\u001f]/.test(host))throw new Error('Invalid service bind host.');
 if(!loopback&&!hosted)throw new Error('Remote bind requires explicit hosted mode.');
 if(hosted){
  if(env.OURO_LOCAL_DEMO==='1'||env.OURO_HUMAN_TOKEN||env.OURO_AGENT_TOKEN)throw new Error('Hosted mode forbids local demo and shared operator/agent credentials.');
  let origin:URL;try{origin=new URL(env.OURO_PUBLIC_URL??'');}catch{throw new Error('Hosted mode requires an exact HTTPS public origin.');}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Hosted mode requires an exact HTTPS public origin.');
  if(!env.DATABASE_URL||!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))throw new Error('Hosted mode requires a PostgreSQL profile.');
 }
 if(!env.DATABASE_URL&&!env.OURO_DATA_DIR)throw new Error('Set an explicit OURO_DATA_DIR or DATABASE_URL; no working profile is selected implicitly.');
 if(env.DATABASE_URL&&!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))throw new Error('Invalid PostgreSQL profile.');
 const absolute=(value:string)=>{if(!path.isAbsolute(value))throw new Error('Runtime resource/data paths must be absolute.');return path.normalize(value);};
 const dataDir=env.OURO_DATA_DIR==='memory://'?'memory://':env.OURO_DATA_DIR?absolute(env.OURO_DATA_DIR):undefined;
 const shutdownTimeoutMs=Number(env.OURO_SHUTDOWN_TIMEOUT_MS??'10000');
 if(!Number.isSafeInteger(shutdownTimeoutMs)||shutdownTimeoutMs<1||shutdownTimeoutMs>150000)throw new Error('Invalid shutdown deadline.');
 return {environment:env,host,port,dataDir,databaseUrl:env.DATABASE_URL,resourceRoot,migrationsDir:options.migrationsDir?absolute(options.migrationsDir):path.join(resourceRoot,'db/migrations'),mcpPath:options.mcpPath?absolute(options.mcpPath):path.join(resourceRoot,'packages/mcp/bin/ouro-mcp.mjs'),verificationRuntimeDir:env.OURO_VERIFICATION_RUNTIME_DIR?absolute(env.OURO_VERIFICATION_RUNTIME_DIR):dataDir&&dataDir!=='memory://'?dataDir+'.verification-runtime':path.join(tmpdir(),'ouro-service-verification-runtime'),packageRoot:options.packageRoot?absolute(options.packageRoot):resourceRoot,staticRoot:env.OURO_STATIC_ROOT?absolute(env.OURO_STATIC_ROOT):undefined,shutdownTimeoutMs};
}
