import {readCommittedConsumerSource} from '../../../scripts/consumer-delivery/committed-source.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';

export const LEGACY_AGENT_CLI_COMMIT='29989b459387836e40bae454869dede998a7ebc8';

/** Копирует canonical oracle и его точный SDK install; app/dist и developer checkout не используются. */
export async function prepareLegacyAgentCli({repository,directory,npmCli}){
 const source=readCommittedConsumerSource({repository,ref:LEGACY_AGENT_CLI_COMMIT});await mkdir(directory);
 const files=[...source.protocolFiles,...source.consumerFiles,...source.agentToolFiles];
 const put=async(relative,content)=>{await mkdir(path.dirname(path.join(directory,relative)),{recursive:true});await writeFile(path.join(directory,relative),content,{flag:'wx'});};
 const unique=new Map(files.map(file=>[file.path,file]));for(const file of unique.values())await put(file.path,file.bytes);
 for(const relative of ['package.json','package-lock.json'])await put(relative,execFileSync('git',['--no-replace-objects','-C',repository,'show',LEGACY_AGENT_CLI_COMMIT+':'+relative],{windowsHide:true,shell:false,maxBuffer:4*1024*1024}));
 const keys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'],env=Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));env.PATH=path.dirname(process.execPath)+path.delimiter+(env.PATH??'');env.npm_execpath=npmCli;env.NODE_ENV='production';
 for(const [phase,args]of [['SDK_INSTALL',[npmCli,'ci','--include=dev','--no-audit','--no-fund']],['PROTOCOL_INPUT',[path.join(directory,'packages/protocol/scripts/build.mjs')]]]){const result=spawnSync(process.execPath,args,{cwd:directory,env,windowsHide:true,shell:false,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});if(result.error||result.status!==0)throw Error('Legacy CLI setup failed: '+phase);}
 return {directory,commit:source.commit};
}
