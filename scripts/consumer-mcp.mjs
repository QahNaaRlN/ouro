import {validateNodeVersion} from './runtime-node.mjs';
import {readBuiltGeneration} from './consumer-delivery/generation-state.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

/** Сохраняет caller cwd/credentials; issued selector связывает bridge с обслуживающим поколением. */
export async function runConsumerMcp({root,argv=process.argv.slice(2)}){
 validateNodeVersion(process.versions.node);let id,forward=[];
 if(argv[0]==='--generation'){id=argv[1];if(!/^g-[a-f0-9-]{36}$/.test(id??''))throw Error();argv=argv.slice(2);}
 if(argv.length){if(argv.length!==1||argv[0]!=='--help')throw Error();forward=['--help'];}
 const generation=await readBuiltGeneration(root,id),entry=path.join(generation.directory,'apps/service/dist/resources/mcp/bin/ouro-mcp.mjs');process.argv=[process.execPath,entry,...forward];await import(pathToFileURL(entry).href);
}
