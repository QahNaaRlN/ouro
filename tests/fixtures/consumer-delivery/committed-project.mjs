import {readCommittedConsumerSource} from '../../../scripts/consumer-delivery/committed-source.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

export const ownedDeliveryFiles=['dependencies.json','package-lock.template.json','registry-provenance.json','build-consumer.mjs.template','tsconfig.source.json'];

/** Создаёт отдельную committed fixture из canonical app blobs и конечных текущих owner templates. */
export async function createCommittedProjectFixture(origin){
 const source=readCommittedConsumerSource({repository:origin,ref:'HEAD'}),directory=await mkdtemp(path.join(tmpdir(),'ouro-consumer-project-')),repository=path.join(directory,'committed source & данные');await mkdir(repository);
 const put=async(relative,bytes)=>{const file=path.join(repository,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);};
 const files=[...source.consumerFiles,...source.protocolFiles,...source.qualificationFiles];for(const file of files)await put(file.path,file.bytes);
 await put('package.json',execFileSync('git',['--no-replace-objects','-C',origin,'show',`${source.commit}:package.json`]));
 for(const file of ownedDeliveryFiles)await put('release/consumer/'+file,await readFile(path.join(origin,'release/consumer',file)));
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 const git=args=>execFileSync('git',['--no-replace-objects','-C',repository,...args],{env:environment,encoding:'utf8',windowsHide:true,shell:false});
 git(['init','-q']);for(const[name,value]of [['user.name','Qualification Fixture'],['user.email','fixture@example.invalid'],['core.autocrlf','false'],['commit.gpgsign','false']])git(['config',name,value]);git(['add','--all']);for(const file of files)if(file.mode==='100755')git(['update-index','--chmod=+x','--',file.path]);git(['commit','-qm','test: commit isolated consumer source fixture']);
 return {directory,repository,commit:git(['rev-parse','HEAD']).trim(),originCommit:source.commit,close:async()=>{if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('ouro-consumer-project-'))throw Error('Refused foreign fixture cleanup');await rm(directory,{recursive:true,force:true});}};
}
