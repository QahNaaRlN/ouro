import {validateNodeVersion} from './runtime-node.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** Запускает developer qualification без установки root dependencies или выбора рабочего профиля. */
async function main(){
 validateNodeVersion(process.versions.node);
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),options={repository:root,ref:'HEAD',workDirectory:undefined,npmCli:process.env.npm_execpath,browser:false,installBrowser:false};
 for(let index=0;index<args.length;index++){
  if(args[index]==='--browser'){options.browser=true;continue;}
  if(args[index]==='--install-browser'){options.installBrowser=true;continue;}
  const field={'--work':'workDirectory','--ref':'ref'}[args[index]];
  if(!field||!args[index+1]||args[index+1].startsWith('--'))throw Error();options[field]=args[++index];
 }
 if(!options.workDirectory||!path.isAbsolute(options.workDirectory)||typeof options.npmCli!=='string'||!path.isAbsolute(options.npmCli))throw Error();
 process.stdout.write('Ouro: qualifying a new independent consumer source tree.\n');
 const {qualifyConsumerSource}=await import('./consumer-delivery/qualify-build-tree.mjs'),report=await qualifyConsumerSource(options);process.stdout.write(JSON.stringify(report)+'\n');if(report.overall!=='PASS')process.exitCode=1;
}

try{await main();}catch(error){process.stderr.write(error?.code==='NODE_RUNTIME_UNSUPPORTED'?'NODE_RUNTIME_UNSUPPORTED: '+error.message+'\n':'OURO_CONSUMER_QUALIFICATION_FAILED'+(typeof error?.phase==='string'?' '+error.phase:'')+'\n');process.exitCode=1;}
