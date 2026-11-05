import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const {allocateGeneration}=await import(pathToFileURL(process.argv[2]).href),generation=await allocateGeneration(process.argv[3]);
/** Контролируемый surviving child моделирует доказанный npm orphan, без общей process-tree гарантии. */
spawn(process.execPath,[process.argv[4],generation.directory,process.argv[5]],{detached:true,windowsHide:true,stdio:['ignore',process.stdout,process.stderr],shell:false}).unref();
process.stdout.write(JSON.stringify({kind:'parent',generation})+'\n');
setInterval(()=>{},1000);
