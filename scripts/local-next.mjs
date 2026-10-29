import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const mode=process.argv[2];
if(mode!=='dev'&&mode!=='start'){
 console.error('Usage: node scripts/local-next.mjs <dev|start> [Next.js options]');
 process.exitCode=1;
}else{
 const cli=createRequire(import.meta.url).resolve('next/dist/bin/next');
 process.env.OURO_LOCAL_DEMO='1';
 process.argv=[process.execPath,cli,mode,'--hostname','127.0.0.1',...process.argv.slice(3)];
 // Run the actual CLI in this process: Next owns shutdown signals and exit codes.
 await import(pathToFileURL(cli).href);
}
