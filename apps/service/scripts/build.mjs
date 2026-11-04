import {build} from 'esbuild';
import {mkdir,copyFile,readdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const service=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(service,'../..'),output=path.join(service,'dist');
await mkdir(output,{recursive:true});
const built=await build({entryPoints:{main:path.join(service,'src/main.ts'),index:path.join(service,'src/index.ts')},outdir:output,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',target:'node24',format:'esm',packages:'external',sourcemap:true,metafile:true,tsconfig:path.join(service,'tsconfig.json'),banner:{js:"import {createRequire as __ouroCreateRequire} from 'node:module';const require=__ouroCreateRequire(import.meta.url);"}});
const migrations=path.join(output,'resources/migrations');await mkdir(migrations,{recursive:true});
for(const file of await readdir(path.join(root,'db/migrations')))if(/^\d{3}_[a-z_]+\.sql$/.test(file))await copyFile(path.join(root,'db/migrations',file),path.join(migrations,file));
const mcp=path.join(output,'resources/mcp/bin');await mkdir(mcp,{recursive:true});await copyFile(path.join(root,'packages/mcp/bin/ouro-mcp.mjs'),path.join(mcp,'ouro-mcp.mjs'));
const verification=path.join(output,'resources/verification');await mkdir(verification,{recursive:true});await copyFile(path.join(root,'lib/verification/runtime/playwright-preload.mjs'),path.join(verification,'playwright-preload.mjs'));
const product=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));await writeFile(path.join(output,'package.json'),JSON.stringify({type:'module',version:product.version})+'\n');
await writeFile(path.join(output,'build-manifest.json'),JSON.stringify({schemaVersion:1,entries:['main.mjs','index.mjs'],resources:['resources/migrations','resources/mcp/bin/ouro-mcp.mjs','resources/verification/playwright-preload.mjs','package.json'],externalPackages:true,inputs:Object.keys(built.metafile.inputs).sort()},null,2)+'\n');
