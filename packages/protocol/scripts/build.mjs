import {readFile,writeFile,mkdir,readdir,rm,chmod,lstat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const generated=`// Generated from package.json by scripts/build.mjs.\nexport const PROTOCOL_VERSION = '${pkg.version}' as const;\n`;
await writeFile(path.join(root,'src/version.ts'),generated);
const tsc=createRequire(import.meta.url).resolve('typescript/bin/tsc');
for(const config of ['tsconfig.json','tsconfig.cjs.json']){
 const compiled=spawnSync(process.execPath,[tsc,'-p',path.join(root,config)],{cwd:root,stdio:'inherit'});
 if(compiled.status!==0)process.exit(compiled.status??1);
}
await writeFile(path.join(root,'dist/cjs/package.json'),JSON.stringify({type:'commonjs'})+'\n');
const {createSchemaBundle,PROTOCOL_VERSION}=await import(pathToFileURL(path.join(root,'dist/esm/index.js')).href);
if(PROTOCOL_VERSION!==pkg.version)throw new Error('Protocol package and manifest versions differ');
const bundle=createSchemaBundle(),artifacts=new Map([['manifest.json',bundle.manifest],['bundle.json',bundle]]);
bundle.manifest.schemas.forEach((entry,index)=>artifacts.set(entry.file,bundle.schemas[index]));
const directory=path.join(root,'schemas');await mkdir(directory,{recursive:true});
for(const [filename,value]of artifacts){
 const rendered=JSON.stringify(value,null,2)+'\n',destination=path.join(directory,filename);
 if(check){if(await readFile(destination,'utf8')!==rendered)throw new Error(`Generated contract is stale: ${filename}`);}
 else await writeFile(destination,rendered);
}
for(const filename of await readdir(directory)){
 if(filename.endsWith('.json')&&!artifacts.has(filename)){
  if(check)throw new Error(`Obsolete generated contract: ${filename}`);
  await rm(path.join(directory,filename));
 }
}
console.log(`${pkg.name}@${pkg.version}: ${bundle.schemas.length} schemas ${check?'verified':'generated'}`);

// A restrictive build-machine umask must not make an installed library private
// to the installing OS account. Only the explicit distribution whitelist is touched.
async function distributionModes(relative){
 const absolute=path.join(root,relative),stat=await lstat(absolute);
 if(stat.isSymbolicLink())throw new Error(`Distribution files must be self-contained: ${relative}`);
 await chmod(absolute,stat.isDirectory()?0o755:relative.startsWith('bin/')?0o755:0o644);
 if(stat.isDirectory())for(const child of await readdir(absolute))await distributionModes(`${relative}/${child}`);
}
for(const entry of [...pkg.files,'package.json'])await distributionModes(entry);
