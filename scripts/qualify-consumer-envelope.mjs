import {validateNodeVersion} from './runtime-node.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** CLI использует только stdlib до Node admission; выводит безопасный bounded report. */
try{
 validateNodeVersion(process.versions.node);const argv=process.argv.slice(2),options={repository:fileURLToPath(new URL('../',import.meta.url)),ref:'HEAD',browser:false,installBrowser:false};
 for(let index=0;index<argv.length;index++){if(argv[index]==='--browser'&&!options.browser)options.browser=true;else if(argv[index]==='--install-browser'&&!options.installBrowser)options.installBrowser=true;else if(argv[index]==='--work'&&!options.workDirectory&&path.isAbsolute(argv[index+1]??''))options.workDirectory=argv[++index];else throw Error();}if(!options.workDirectory||!process.env.npm_execpath)throw Error();options.npmCli=process.env.npm_execpath;
 const {qualifyConsumerEnvelope}=await import('./consumer-delivery/qualify-envelope.mjs');const result=await qualifyConsumerEnvelope(options);process.stdout.write(JSON.stringify(result)+'\n');if(result.overall!=='PASS')process.exitCode=1;
}catch(error){process.stderr.write(error?.code==='NODE_RUNTIME_UNSUPPORTED'?'NODE_RUNTIME_UNSUPPORTED: '+error.message+'\n':'OURO_CONSUMER_ENVELOPE_QUALIFICATION_FAILED'+(typeof error?.phase==='string'?' '+error.phase:'')+'\n');process.exitCode=1;}
