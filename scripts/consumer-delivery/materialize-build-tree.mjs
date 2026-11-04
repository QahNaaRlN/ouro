import {validateNodeVersion} from '../runtime-node.mjs';
import {readCommittedConsumerSource} from './committed-source.mjs';
import {materializeConsumerDependencies} from './dependency-contract.mjs';
import {protocolMetadata} from '../pack-release.mjs';
import {mkdir,mkdtemp,writeFile,readFile,chmod,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Обозначает неполную materialization без raw process output, paths или configuration values. */
export class ConsumerMaterializationError extends Error{
 constructor(code='CONSUMER_MATERIALIZATION_FAILED'){super(code==='CONSUMER_OUTPUT_EXISTS'?'Consumer output already exists; choose a new directory.':'Consumer source materialization failed.');this.name='ConsumerMaterializationError';this.code=code;}
}

/** Сохраняет canonical source mode; входные path/mode уже прошли полный Git audit. */
async function put(root,relative,bytes,mode='100644'){
 const target=path.join(root,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});await chmod(target,mode==='100755'?0o755:0o644);
}

/** Не передаёт SQL/identity authority в protocol installer и не читает app env files. */
function producerEnvironment(npmCli){
 const keys=['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'];
 const environment=Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 environment.PATH=path.dirname(process.execPath)+path.delimiter+(environment.PATH??'');environment.npm_execpath=npmCli;return environment;
}

/** Ограничивает canonical producer stage; failure оставляет unique scratch без небезопасного cleanup. */
function runNode(cwd,args,environment){
 const result=spawnSync(process.execPath,args,{cwd,env:environment,encoding:'utf8',shell:false,windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
 if(result.status!==0||result.error)throw new ConsumerMaterializationError('CONSUMER_PROTOCOL_BUILD_FAILED');return result.stdout;
}

/** Создаёт новый source-build output только из committed inputs, не выбирая runtime profile. */
export async function materializeConsumerBuildTree(options){
 validateNodeVersion(process.versions.node);
 try{
  if(!options||!['repository','outputDirectory','npmCli'].every(key=>typeof options[key]==='string'&&path.isAbsolute(options[key])&&!/[\u0000-\u001f\u007f]/.test(options[key])))throw new Error();
  const source=readCommittedConsumerSource({repository:options.repository,ref:options.ref}),output=path.resolve(options.outputDirectory);
  const delivery=file=>{const entry=source.deliveryFiles.find(value=>value.path==='release/consumer/'+file);if(!entry)throw new Error();return entry;};
  const protocolPackage=source.protocolFiles.find(file=>file.path==='packages/protocol/package.json');if(!protocolPackage)throw new Error();
  const contract={blueprint:delivery('dependencies.json').bytes.toString('utf8'),template:delivery('package-lock.template.json').bytes.toString('utf8'),provenance:delivery('registry-provenance.json').bytes.toString('utf8'),productVersion:source.productVersion};
  const filename=`ouro-protocol-${source.protocolVersion}.tgz`;
  materializeConsumerDependencies({...contract,protocol:{manifest:protocolPackage.bytes.toString('utf8'),filename,bytes:Buffer.from('preflight')}});
  await mkdir(path.dirname(output),{recursive:true});try{await mkdir(output);}catch(error){if(error?.code==='EEXIST')throw new ConsumerMaterializationError('CONSUMER_OUTPUT_EXISTS');throw error;}
  const stage=await mkdtemp(path.join(path.dirname(output),'.ouro-protocol-stage-')),protocolRoot=path.join(stage,'source'),packed=path.join(stage,'packed');await mkdir(protocolRoot);await mkdir(packed);
  for(const file of source.protocolFiles)await put(protocolRoot,file.path.slice('packages/protocol/'.length),file.bytes,file.mode);
  const environment=producerEnvironment(options.npmCli);
  runNode(protocolRoot,[options.npmCli,'ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],environment);
  const metadata=JSON.parse(runNode(protocolRoot,[path.join(protocolRoot,'scripts/pack.mjs'),'--json','--pack-destination',packed],environment));
  if(metadata.length!==1||metadata[0].filename!==filename)throw new Error();
  const archive=path.join(packed,filename),archiveStat=await lstat(archive);if(!archiveStat.isFile()||archiveStat.isSymbolicLink()||archiveStat.size<1||archiveStat.size>32*1024*1024)throw new Error();
  const bytes=await readFile(archive),identity=protocolMetadata(bytes),integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
  if(identity.name!=='@ouro/protocol'||identity.version!==source.protocolVersion||metadata[0].integrity!==integrity)throw new Error();
  const dependency=materializeConsumerDependencies({...contract,protocol:{manifest:JSON.stringify(identity),filename,bytes}});
  for(const file of source.consumerFiles)await put(output,file.path,file.bytes,file.mode);
  await put(output,'scripts/build-consumer.mjs',delivery('build-consumer.mjs.template').bytes);
  await put(output,'tsconfig.json',delivery('tsconfig.source.json').bytes);
  const manifest={...dependency.manifest,scripts:{build:'node scripts/build-consumer.mjs'}};
  await put(output,'package.json',JSON.stringify(manifest,null,2)+'\n');await put(output,'package-lock.json',JSON.stringify(dependency.lockfile,null,2)+'\n');await put(output,'vendor/'+filename,bytes);
  const sourceManifest={schemaVersion:1,stage:'SOURCE_BUILD_MATERIALIZED',endUserRelease:'NOT_QUALIFIED',sourceCommit:source.commit,productVersion:source.productVersion,protocolVersion:source.protocolVersion,protocol:{filename,integrity,sha256:createHash('sha256').update(bytes).digest('hex'),sourceFiles:source.protocolFiles.map(({path,blob,mode,sha256})=>({path,blob,mode,sha256}))},inputs:source.consumerFiles.map(({path,blob,mode,sha256})=>({path,blob,mode,sha256})),deliveryInputs:source.deliveryFiles.map(({path,blob,mode,sha256})=>({path,blob,mode,sha256})),producerScratch:'UNIQUE_SIBLING_RETAINED',launcher:'NOT_IMPLEMENTED'};
  await put(output,'delivery-manifest.json',JSON.stringify(sourceManifest,null,2)+'\n');
  return {directory:output,commit:source.commit,productVersion:source.productVersion,protocolVersion:source.protocolVersion,manifest:sourceManifest};
 }catch(error){if(error instanceof ConsumerMaterializationError)throw error;throw new ConsumerMaterializationError();}
}
