import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export function validateHostedEnvironment(env) {
 if(env.OURO_LOCAL_DEMO==='1'||env.OURO_HUMAN_TOKEN||env.OURO_AGENT_TOKEN)throw new Error('Hosted mode forbids local demo and shared operator/agent credentials.');
 let origin;try{origin=new URL(env.OURO_PUBLIC_URL);}catch{throw new Error('OURO_PUBLIC_URL must be an exact HTTPS origin.');}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('OURO_PUBLIC_URL must be an exact HTTPS origin.');
 if(!env.DATABASE_URL||!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))throw new Error('Hosted mode requires a dedicated PostgreSQL DATABASE_URL.');
 const port=env.PORT??'3000';if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('PORT must be a valid port.');
 return {origin:origin.origin,port};
}

async function startHosted(){
 try{
  if(process.argv.length!==2)throw new Error('Hosted launcher accepts environment configuration only.');
  const {port}=validateHostedEnvironment(process.env);
  process.env.NODE_ENV='production';process.env.OURO_LOCAL_DEMO='0';process.env.OURO_DEPLOYMENT_MODE='cloud';
  const cli=createRequire(import.meta.url).resolve('next/dist/bin/next');
  process.argv=[process.execPath,cli,'start','--hostname','0.0.0.0','--port',port];
  await import(pathToFileURL(cli).href);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)void startHosted();
