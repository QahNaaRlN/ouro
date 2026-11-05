import {preview} from 'vite';
import {fileURLToPath} from 'node:url';

// Только static preview уже собранного test entry, без application API/profile.
const server=await preview({configFile:false,root:fileURLToPath(new URL('../..',import.meta.url)),build:{outDir:fileURLToPath(new URL('../../../../.operations/i18n-production',import.meta.url))},preview:{host:'127.0.0.1',port:3493,strictPort:true}});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.httpServer.close(()=>process.exit(0)));
