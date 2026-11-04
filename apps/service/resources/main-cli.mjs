import {validateNodeVersion,NodeRuntimeUnsupportedError} from './resources/runtime-node.mjs';

/** Проверяет runtime до загрузки application bundle, SQLite, PGlite и конфигурации профиля. */
try{validateNodeVersion(process.versions.node);await import('./application.mjs');}
catch(error){
 process.stderr.write(error instanceof NodeRuntimeUnsupportedError?'NODE_RUNTIME_UNSUPPORTED: '+error.message+'\n':'OURO_SERVICE_STARTUP_FAILED\n');
 process.exitCode=1;if(process.connected)process.disconnect();
}
