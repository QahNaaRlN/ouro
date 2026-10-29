import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.join(root,'artifacts');
await mkdir(destination,{recursive:true});
if(!process.env.npm_execpath)throw new Error('Run npm run protocol:pack');
const packed=spawnSync(process.execPath,[process.env.npm_execpath,'pack','--pack-destination',destination],{cwd:path.join(root,'packages/protocol'),stdio:'inherit'});
process.exitCode=packed.status??1;
