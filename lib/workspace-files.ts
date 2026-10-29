import {constants} from 'node:fs';
import {open,realpath,lstat,readdir,type FileHandle} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isWellFormedUnicode} from '../packages/core/src/unicode';

export type WorkspaceIdentity={dev:string;ino:string};
export type WorkspaceBinding={id:string;canonicalPath:string;identity:WorkspaceIdentity};
export type WorkspaceFolder={canonicalPath:string;displayName:string;identity:WorkspaceIdentity};
export class WorkspaceFileError extends Error{
 constructor(public code:string,message:string,public status=422){super(message);this.name='WorkspaceFileError';}
}
function fail(code:string,message:string,status=422):never{throw new WorkspaceFileError(code,message,status);}
const deniedDirectories=new Set(['.git','node_modules','.ssh','.aws','.azure','.kube','.docker','.gnupg','.config']);
const forbiddenName=(name:string)=>{
 const lower=name.toLowerCase();
 return deniedDirectories.has(lower)||lower.startsWith('.env')||['.npmrc','.pypirc','.netrc','.git-credentials','credentials','credentials.json','credential.json','auth.json','secrets.json'].includes(lower)||/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*(?:private[-_]?key|service[-_]?account|secrets?)(?:\.|$))/i.test(name)||/\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name);
};
const validName=(name:string)=>!name.includes('\\')&&!name.includes('\0')&&!forbiddenName(name);
const identity=(stat:{dev:bigint|number;ino:bigint|number}):WorkspaceIdentity=>({dev:String(stat.dev),ino:String(stat.ino)});
const matches=(left:WorkspaceIdentity,right:WorkspaceIdentity)=>left.dev===right.dev&&left.ino===right.ino;
const folderError=()=>new WorkspaceFileError('WORKSPACE_BINDING_CONFLICT','Папка проекта исчезла, была заменена или больше не соответствует сохранённой привязке.',409);
function absoluteFolder(value:unknown):string{
 if(typeof value!=='string'||!value||value.length>4096||/[\u0000-\u001f\u007f]/.test(value)||!isWellFormedUnicode(value)||!path.isAbsolute(value))fail('VALIDATION_ERROR','Укажите абсолютный путь к существующей локальной папке.');
 return value;
}
function relativeParts(value:unknown,allowEmpty:boolean):string[]{
 if(typeof value!=='string'||value.length>4096||/[\u0000-\u001f\u007f]/.test(value)||!isWellFormedUnicode(value)||value.includes('\\')||path.posix.isAbsolute(value)||path.win32.isAbsolute(value)||/^[a-z]:/i.test(value))fail('VALIDATION_ERROR','Нужен относительный путь внутри папки проекта.');
 if(value===''){if(allowEmpty)return [];fail('VALIDATION_ERROR','Укажите относительный путь к файлу.');}
 const parts=value.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))fail('VALIDATION_ERROR','Путь не должен содержать пустые сегменты, . или ...');
 if(parts.some(part=>!validName(part)))fail('FORBIDDEN','Служебные каталоги и файлы с учётными данными недоступны.',403);
 return parts;
}
function protectedAbsolute(canonicalPath:string):boolean{return canonicalPath.split(path.sep).filter(Boolean).some(part=>forbiddenName(part));}

/** Selecting a root may resolve an alias; its resulting identity is immutable. */
export async function resolveWorkspaceFolder(value:string):Promise<WorkspaceFolder>{
 const input=absoluteFolder(value);
 try{
  const canonicalPath=await realpath(input),stat=await lstat(canonicalPath,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('VALIDATION_ERROR','Выбранный путь должен быть существующей папкой.');
  if(protectedAbsolute(canonicalPath))fail('FORBIDDEN','Служебную папку или каталог учётных данных нельзя использовать как файловый контекст.',403);
  return {canonicalPath,displayName:path.basename(canonicalPath)||canonicalPath,identity:identity(stat)};
 }catch(error){if(error instanceof WorkspaceFileError)throw error;fail('VALIDATION_ERROR','Папка не существует или недоступна для чтения.');}
}

/** Reject disappearance, inode replacement and a new symlink at the saved path. */
export async function assertWorkspaceFolder(binding:WorkspaceBinding):Promise<void>{
 try{
  absoluteFolder(binding.canonicalPath);
  const stat=await lstat(binding.canonicalPath,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||!matches(identity(stat),binding.identity)||(await realpath(binding.canonicalPath))!==binding.canonicalPath)throw folderError();
 }catch{throw folderError();}
}

type Opened={handle:FileHandle;absolutePath:string;validate:()=>Promise<void>;close:()=>Promise<void>};
type OpenedPath={handle:FileHandle;absolutePath:string;identity:WorkspaceIdentity};
const directoryFlags=constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0);
function anchored(handle:FileHandle,absolutePath:string):string{
 // On Linux each next component is anchored to an already-open directory.
 // Concurrent renames cannot redirect traversal through a replacement symlink.
 return process.platform==='linux'?`/proc/self/fd/${handle.fd}`:absolutePath;
}
async function assertOpenedPath(item:OpenedPath):Promise<void>{
 try{
  const actualPath=await realpath(anchored(item.handle,item.absolutePath));
  const [actual,named]=await Promise.all([item.handle.stat({bigint:true}),lstat(item.absolutePath,{bigint:true})]);
  if(actualPath!==item.absolutePath||named.isSymbolicLink()||!matches(identity(actual),item.identity)||!matches(identity(named),item.identity))throw folderError();
 }catch{throw folderError();}
}
async function openWithin(binding:WorkspaceBinding,parts:string[],file:boolean):Promise<Opened>{
 await assertWorkspaceFolder(binding);
 const handles:FileHandle[]=[],paths:OpenedPath[]=[];
 const close=async()=>{await Promise.all(handles.reverse().map(handle=>handle.close()));};
 const validate=async()=>{
  await assertWorkspaceFolder(binding);
  // A descriptor stays live after rename. Every opened ancestor and the final
  // file must still occupy its exact requested path, not merely the same inode.
  for(const item of paths)await assertOpenedPath(item);
  await assertWorkspaceFolder(binding);
 };
 try{
  let absolutePath=binding.canonicalPath,handle=await open(absolutePath,directoryFlags);handles.push(handle);
  if(!matches(identity(await handle.stat({bigint:true})),binding.identity))throw folderError();
  paths.push({handle,absolutePath,identity:binding.identity});await assertOpenedPath(paths[0]);
  for(let index=0;index<parts.length;index++){
   const last=index===parts.length-1,next=path.join(anchored(handle,absolutePath),parts[index]);
   absolutePath=path.join(absolutePath,parts[index]);
   const item=await lstat(next);
   if(item.isSymbolicLink())fail('FORBIDDEN','Внутренние символические ссылки недоступны.',403);
   if(last&&file?!item.isFile():!item.isDirectory())fail('VALIDATION_ERROR',file?'Путь должен указывать на обычный файл.':'Путь должен указывать на папку.');
   if(last&&file&&item.nlink>1)fail('FORBIDDEN','Файлы с несколькими жёсткими ссылками недоступны как контекст.',403);
   handle=await open(next,last&&file?constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0):directoryFlags);handles.push(handle);
   const opened=await handle.stat();
   if(!matches(identity(item),identity(opened)))fail('WORKSPACE_BINDING_CONFLICT','Файловый путь изменился во время чтения.',409);
   if(last&&file?!opened.isFile():!opened.isDirectory())fail('VALIDATION_ERROR',file?'Путь должен указывать на обычный файл.':'Путь должен указывать на папку.');
   if(last&&file&&opened.nlink>1)fail('FORBIDDEN','Файлы с несколькими жёсткими ссылками недоступны как контекст.',403);
   const openedPath={handle,absolutePath,identity:identity(opened)};paths.push(openedPath);await assertOpenedPath(openedPath);
  }
  await validate();
  return {handle,absolutePath,validate,close};
 }catch(error){await close();if(error instanceof WorkspaceFileError)throw error;
  const code=(error as NodeJS.ErrnoException).code;
  if(code==='ENOENT')fail('NOT_FOUND','Файл или папка не найдены.',404);
  if(code==='ELOOP')fail('FORBIDDEN','Символические ссылки недоступны.',403);
  fail('VALIDATION_ERROR','Файл или папка недоступны для безопасного чтения.');
 }
}

export async function browseWorkspaceFolders(value?:string):Promise<{path:string;parentPath:string|null;entries:{name:string;path:string}[];truncated:boolean}>{
 const root=await resolveWorkspaceFolder(value??process.cwd());
 try{
  const items=(await readdir(root.canonicalPath,{withFileTypes:true})).filter(item=>item.isDirectory()&&!item.isSymbolicLink()&&validName(item.name)).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const parentPath=path.dirname(root.canonicalPath);
  return {path:root.canonicalPath,parentPath:parentPath===root.canonicalPath?null:parentPath,entries:items.slice(0,100).map(item=>({name:item.name,path:path.join(root.canonicalPath,item.name)})),truncated:items.length>100};
 }catch{fail('VALIDATION_ERROR','Не удалось просмотреть выбранную папку.');}
}

export async function listWorkspaceFiles(binding:WorkspaceBinding,value='',cursor=0):Promise<{path:string;entries:{name:string;path:string;kind:'file'|'directory';size?:number}[];nextCursor:number|null;truncated:boolean}>{
 const parts=relativeParts(value,true);
 if(!Number.isSafeInteger(cursor)||cursor<0)fail('VALIDATION_ERROR','Курсор списка должен быть неотрицательным безопасным целым.');
 const opened=await openWithin(binding,parts,false);
 try{
  await opened.validate();
  const items=(await readdir(anchored(opened.handle,opened.absolutePath),{withFileTypes:true})).filter(item=>validName(item.name)&&!item.isSymbolicLink()&&(item.isFile()||item.isDirectory())).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const entries:{name:string;path:string;kind:'file'|'directory';size?:number}[]=[];
  for(const item of items.slice(cursor,cursor+200)){
   const entry={name:item.name,path:[...parts,item.name].join('/'),kind:item.isDirectory()?'directory' as const:'file' as const};
   if(item.isFile()){
    const stat=await lstat(path.join(anchored(opened.handle,opened.absolutePath),item.name));
    if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink>1)continue;
    entries.push({...entry,size:stat.size});
   }else entries.push(entry);
  }
  await opened.validate();
  const nextCursor=cursor+200<items.length?cursor+200:null;
  return {path:parts.join('/'),entries,nextCursor,truncated:nextCursor!==null};
 }finally{await opened.close();}
}

export async function readWorkspaceFile(binding:WorkspaceBinding,value:string):Promise<{path:string;text:string;sha256:string;size:number;modifiedAt:string}>{
 const parts=relativeParts(value,false),opened=await openWithin(binding,parts,true);
 try{
  await opened.validate();
  const before=await opened.handle.stat();
  if(before.size>128*1024)fail('VALIDATION_ERROR','Файл превышает ограничение 128 KiB.');
  const buffer=Buffer.alloc(128*1024+1);let size=0;
  while(size<buffer.length){const chunk=await opened.handle.read(buffer,size,buffer.length-size,size);if(chunk.bytesRead===0)break;size+=chunk.bytesRead;}
  if(size>128*1024)fail('VALIDATION_ERROR','Файл превышает ограничение 128 KiB.');
  const bytes=buffer.subarray(0,size);let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('VALIDATION_ERROR','Файл не является корректным текстом UTF-8.');}
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))fail('VALIDATION_ERROR','Бинарные файлы недоступны как текстовый контекст.');
  const after=await opened.handle.stat();
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||size!==after.size)fail('WORKSPACE_BINDING_CONFLICT','Файл изменился во время чтения; повторите запрос.',409);
  await opened.validate();
  return {path:parts.join('/'),text,sha256:createHash('sha256').update(bytes).digest('hex'),size,modifiedAt:after.mtime.toISOString()};
 }finally{await opened.close();}
}
