import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runtimeConfiguration} from './runtime/configuration.js';
import {startService} from './runtime/start-service.js';
import {StartupCleanupIncompleteError} from './runtime/cleanup-startup.js';

/** Запускает отдельный runtime; рабочий storage profile выбирается только явной конфигурацией. */
async function main(){
 if(process.argv.length!==2)throw new Error('Service accepts environment configuration only.');
 const serviceRoot=fileURLToPath(new URL('./',import.meta.url)),resourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
 const built=path.basename(path.dirname(fileURLToPath(import.meta.url)))==='dist';
 const configuration=runtimeConfiguration(process.env,{resourceRoot,migrationsDir:built?path.join(serviceRoot,'resources/migrations'):undefined,mcpPath:built?path.join(serviceRoot,'resources/mcp/bin/ouro-mcp.mjs'):undefined,playwrightPreloadPath:built?path.join(serviceRoot,'resources/verification/playwright-preload.mjs'):undefined,packageRoot:path.dirname(serviceRoot)});
 const service=await startService(configuration,{report:event=>{process.stderr.write(JSON.stringify(event)+'\n');}});
 process.stdout.write('OURO_SERVICE_READY '+JSON.stringify({url:service.url})+'\n');
 let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;void service.stop().catch(()=>{process.stderr.write('OURO_SERVICE_SHUTDOWN_FAILED\n');process.exitCode=1;}).finally(()=>{if(process.connected)process.disconnect();});};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 if(process.send){process.on('message',message=>{if(message==='ouro:shutdown')stop();});process.once('disconnect',stop);}
}

void main().catch(error=>{process.stderr.write(error instanceof StartupCleanupIncompleteError?'OURO_SERVICE_STARTUP_CLEANUP_INCOMPLETE '+JSON.stringify(error.cleanup)+'\n':'OURO_SERVICE_STARTUP_FAILED\n');process.exitCode=1;if(process.connected)process.disconnect();});
