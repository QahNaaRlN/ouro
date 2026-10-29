import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,link,rename,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import fsPromises from 'node:fs/promises';

async function api(){
 assert(existsSync(path.resolve('lib/workspace-files.ts')),'The read-only workspace filesystem feature is missing');
 return import('../lib/workspace-files');
}
async function fixture(){
 const base=await mkdtemp(path.join(tmpdir(),'ouro-workspace-files-')),root=path.join(base,'project');await mkdir(root);
 return {base,root,close:()=>rm(base,{recursive:true,force:true})};
}
const rejected=(error:unknown)=>typeof(error as {code?:string}).code==='string'&&!(error as {message:string}).message.includes('super-secret');

test('WF01 an arbitrary folder without Git resolves canonically and aliases share an immutable identity',async()=>{
 const f=await fixture();try{
  const fs=await api();await writeFile(path.join(f.root,'README.md'),'Обычная папка, без Git.');
  const alias=path.join(f.base,'alias');await symlink(f.root,alias,'dir');
  const resolved=await fs.resolveWorkspaceFolder(f.root),viaAlias=await fs.resolveWorkspaceFolder(alias);
  assert.deepEqual(viaAlias,resolved);assert.equal(resolved.canonicalPath,f.root);assert.equal(resolved.displayName,'project');
  assert.match(resolved.identity.dev,/^\d+$/);assert.match(resolved.identity.ino,/^\d+$/);
  await fs.assertWorkspaceFolder({id:'binding',canonicalPath:resolved.canonicalPath,identity:resolved.identity});
  await assert.rejects(fs.resolveWorkspaceFolder(path.join(f.root,'README.md')),rejected);
  await assert.rejects(fs.resolveWorkspaceFolder('relative-folder'),rejected);
  await assert.rejects(fs.resolveWorkspaceFolder(path.join(f.base,'missing')),rejected);
 }finally{await f.close();}
});

test('WF02 file IO stays relative, hashes actual UTF-8 content and never writes the selected folder',async()=>{
 const f=await fixture();try{
  const fs=await api();await mkdir(path.join(f.root,'src'));const text='export const сообщение = "Привет";\n';await writeFile(path.join(f.root,'src','main.ts'),text);
  const root=await fs.resolveWorkspaceFolder(f.root),binding={id:'binding',canonicalPath:root.canonicalPath,identity:root.identity};
  const listing=await fs.listWorkspaceFiles(binding);assert.deepEqual(listing.entries,[{name:'src',path:'src',kind:'directory'}]);
  const result=await fs.readWorkspaceFile(binding,'src/main.ts');assert.equal(result.text,text);assert.equal(result.path,'src/main.ts');
  assert.equal(result.size,Buffer.byteLength(text));assert.equal(result.sha256,createHash('sha256').update(text).digest('hex'));assert(Number.isFinite(Date.parse(result.modifiedAt)));
  assert.equal(await readFile(path.join(f.root,'src','main.ts'),'utf8'),text);
  for(const input of ['../outside','src/../../outside','/etc/passwd','C:/Windows/system.ini','src\\main.ts','src/./main.ts','src//main.ts','src/..','src\0main.ts']){
   await assert.rejects(fs.readWorkspaceFile(binding,input),rejected);await assert.rejects(fs.listWorkspaceFiles(binding,input),rejected);
  }
 }finally{await f.close();}
});

test('WF03 inner symlinks, secret paths and binary/oversized text cannot become agent context',async()=>{
 const f=await fixture();try{
  const fs=await api();await writeFile(path.join(f.base,'outside.txt'),'super-secret');await mkdir(path.join(f.base,'outside-dir'));
  await symlink(path.join(f.base,'outside.txt'),path.join(f.root,'link.txt'));await symlink(path.join(f.base,'outside-dir'),path.join(f.root,'link-dir'),'dir');
  await link(path.join(f.base,'outside.txt'),path.join(f.root,'hard-link.txt'));
  const protectedFiles=['.env','.env.local','id_rsa','private.pem','credentials.json'];
  for(const name of protectedFiles)await writeFile(path.join(f.root,name),'super-secret');
  for(const name of ['.git','node_modules','.ssh','.aws']){await mkdir(path.join(f.root,name));await writeFile(path.join(f.root,name,'data.txt'),'super-secret');}
  await writeFile(path.join(f.root,'nul.bin'),Buffer.from([97,0,98]));await writeFile(path.join(f.root,'invalid.txt'),Buffer.from([0xc0,0xaf]));await writeFile(path.join(f.root,'large.txt'),'x'.repeat(128*1024+1));
  await writeFile(path.join(f.root,'safe.txt'),'safe');
  const root=await fs.resolveWorkspaceFolder(f.root),binding={id:'binding',canonicalPath:root.canonicalPath,identity:root.identity};
  const listed=await fs.listWorkspaceFiles(binding);assert.deepEqual(listed.entries.map(entry=>entry.name),['invalid.txt','large.txt','nul.bin','safe.txt']);
  for(const input of [...protectedFiles,'.git/data.txt','node_modules/data.txt','.ssh/data.txt','.aws/data.txt','link.txt','hard-link.txt','link-dir/child.txt','nul.bin','invalid.txt','large.txt'])await assert.rejects(fs.readWorkspaceFile(binding,input),rejected);
  for(const input of ['.git','node_modules','.ssh','.aws','link-dir'])await assert.rejects(fs.listWorkspaceFiles(binding,input),rejected);
  await assert.rejects(fs.resolveWorkspaceFolder(path.join(f.root,'.ssh')),rejected);
 }finally{await f.close();}
});

test('WF04 pagination bounds one directory and does not recursively scan descendants',async()=>{
 const f=await fixture();try{
  const fs=await api();await Promise.all(Array.from({length:205},(_,index)=>writeFile(path.join(f.root,`f${String(index).padStart(3,'0')}.txt`),'x')));
  const root=await fs.resolveWorkspaceFolder(f.root),binding={id:'binding',canonicalPath:root.canonicalPath,identity:root.identity};
  const first=await fs.listWorkspaceFiles(binding);assert.equal(first.entries.length,200);assert.equal(first.nextCursor,200);assert.equal(first.truncated,true);
  const last=await fs.listWorkspaceFiles(binding,'',first.nextCursor!);assert.equal(last.entries.length,5);assert.equal(last.nextCursor,null);assert.equal(last.truncated,false);
  assert.equal(new Set([...first.entries,...last.entries].map(entry=>entry.path)).size,205);
  for(const cursor of [-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])await assert.rejects(fs.listWorkspaceFiles(binding,'',cursor),rejected);
  await Promise.all(Array.from({length:105},(_,index)=>mkdir(path.join(f.base,`directory-${index}`))));
  const browser=await fs.browseWorkspaceFolders(f.base);assert.equal(browser.path,f.base);assert.equal(browser.entries.length,100);assert.equal(browser.truncated,true);
 }finally{await f.close();}
});

test('WF05 missing/replaced roots never silently rebind, even if the path and file names match',async()=>{
 const f=await fixture();try{
  const fs=await api();await writeFile(path.join(f.root,'same.txt'),'old');const root=await fs.resolveWorkspaceFolder(f.root),binding={id:'binding',canonicalPath:root.canonicalPath,identity:root.identity};
  await rename(f.root,path.join(f.base,'old'));await assert.rejects(fs.assertWorkspaceFolder(binding),rejected);
  await mkdir(f.root);await writeFile(path.join(f.root,'same.txt'),'new');
  await assert.rejects(fs.assertWorkspaceFolder(binding),rejected);await assert.rejects(fs.listWorkspaceFiles(binding),rejected);await assert.rejects(fs.readWorkspaceFile(binding,'same.txt'),rejected);
  await rm(f.root,{recursive:true});await symlink(path.join(f.base,'old'),f.root,'dir');await assert.rejects(fs.assertWorkspaceFolder(binding),rejected);
 }finally{await f.close();}
});

test('WF06 an opened nested directory cannot move outside the bound root before or during IO',{skip:process.platform!=='linux'},async()=>{
 for(const stage of ['open','read','list'] as const){
  const f=await fixture(),originalOpen=fsPromises.open,originalReaddir=fsPromises.readdir;let moved=false;
  try{
   const fs=await api();await mkdir(path.join(f.root,'sub'));await writeFile(path.join(f.root,'sub','file.txt'),'inside-before');
   const root=await fs.resolveWorkspaceFolder(f.root),binding={id:'binding',canonicalPath:root.canonicalPath,identity:root.identity};
   const relocate=async()=>{if(moved)return;moved=true;await rename(path.join(f.root,'sub'),path.join(f.base,'outside'));};
   fsPromises.open=(async(...args:Parameters<typeof originalOpen>)=>{
    const handle=await originalOpen(...args),name=String(args[0]);
    if(stage==='open'&&name.startsWith('/proc/self/fd/')&&name.endsWith('/sub')){await relocate();await writeFile(path.join(f.base,'outside','file.txt'),'outside-after');}
    if(stage==='read'&&name.endsWith('/file.txt')){
     const read=handle.read.bind(handle);
     handle.read=(async(...readArgs:unknown[])=>{const result=await (read as (...values:unknown[])=>Promise<unknown>)(...readArgs);await relocate();return result;}) as typeof handle.read;
    }
    return handle;
   }) as typeof originalOpen;
   fsPromises.readdir=(async(...args:Parameters<typeof originalReaddir>)=>{
    const result=await originalReaddir(...args);
    if(stage==='list'&&String(args[0]).startsWith('/proc/self/fd/'))await relocate();
    return result;
   }) as typeof originalReaddir;
   const operation=stage==='list'?fs.listWorkspaceFiles(binding,'sub'):fs.readWorkspaceFile(binding,'sub/file.txt');
   await assert.rejects(operation,error=>(error as {code?:string}).code==='WORKSPACE_BINDING_CONFLICT',`Relocation at ${stage} must fail closed before returning context`);
   assert.equal(moved,true,'The deterministic relocation hook must actually run');
  }finally{fsPromises.open=originalOpen;fsPromises.readdir=originalReaddir;await f.close();}
 }
});
