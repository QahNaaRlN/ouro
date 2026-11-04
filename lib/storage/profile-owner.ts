import {mkdir,realpath,lstat,open,unlink,link} from 'node:fs/promises';
import {constants,type BigIntStats} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import path from 'node:path';

const applicationId=0x4f55524f,marker='ouro.embedded-profile-mutex/v1';
/** Второй fd того же inode снимает POSIX process locks при close; резервируем до любого open. */
const localPaths=new Set<string>(),localInodes=new Set<string>();
const alreadyOwned=()=>new Error('Embedded profile is already owned by another process.');

/** Проверяет файл до открытия SQLite; чужие файлы и symlink не изменяются. */
async function inspectFile(file:string){
 try{const value=await lstat(file,{bigint:true});if(value.isSymbolicLink()||!value.isFile()||value.size>65536n)throw new Error('Unsafe profile mutex file; symbolic links and foreign files are refused.');return value;}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
}

/** Сравнивает идентичность файла, не принимая замену имени за прежний собственный inode. */
function sameIdentity(left:BigIntStats|undefined,right:BigIntStats){return left?.dev===right.dev&&left.ino===right.ino;}

/** Отвергает неполный и чужой header до открытия canonical файла на запись. */
async function validateHeader(file:string,identity:BigIntStats){
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const header=Buffer.alloc(100),checked=await handle.stat({bigint:true}),{bytesRead}=await handle.read(header,0,100,0);
  if(!sameIdentity(checked,identity)||bytesRead!==100||header.subarray(0,16).toString('binary')!=='SQLite format 3\0'||header.readUInt32BE(68)!==applicationId||header[18]!==1||header[19]!==1)throw new Error('File is not an initialized Ouro profile mutex.');
 }finally{await handle.close();}
}

/** Проверяет прежний v1 формат mutex без миграции и нового profile/path hash. */
function validateDatabase(sql:DatabaseSync){
 const mode=sql.prepare('PRAGMA journal_mode').get(),id=sql.prepare('PRAGMA application_id').get();
 if(mode?.journal_mode!=='delete'||id?.application_id!==applicationId)throw new Error('File is not an Ouro profile mutex.');
 const schema=sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(),rows=sql.prepare('SELECT kind FROM ouro_profile_mutex').all();
 if(schema.length!==1||schema[0]?.name!=='ouro_profile_mutex'||rows.length!==1||rows[0]?.kind!==marker)throw new Error('File is not an Ouro profile mutex.');
}

/** Удаляет только собственное уникальное temp-имя после закрытия SQLite. */
async function removeOwnTemporary(file:string,identity:BigIntStats){
 const current=await inspectFile(file);if(!current)return;
 if(!sameIdentity(current,identity))throw new Error('Temporary profile mutex identity changed; cleanup refused.');
 await unlink(file);
}

/** Публикует закрытый committed marker; короткое temp-имя сохраняет прежний SQLite path budget. */
async function publishMarker(mutex:string){
 const temporary=path.join(path.dirname(mutex),'.ouro-'+randomBytes(10).toString('hex'));
 let identity:BigIntStats|undefined,sql:DatabaseSync|undefined;
 try{
  const handle=await open(temporary,'wx',0o600);
  try{identity=await handle.stat({bigint:true});}finally{await handle.close();}
  for(const suffix of ['-journal','-wal','-shm'])await inspectFile(temporary+suffix);
  sql=new DatabaseSync(temporary,{timeout:0,allowExtension:false});
  sql.exec(`PRAGMA journal_mode=DELETE;BEGIN EXCLUSIVE;PRAGMA application_id=${applicationId};CREATE TABLE ouro_profile_mutex(kind TEXT NOT NULL);INSERT INTO ouro_profile_mutex(kind) VALUES('${marker}');COMMIT;`);
  validateDatabase(sql);sql.close();sql=undefined;
  if(!sameIdentity(await inspectFile(temporary),identity))throw new Error('Temporary profile mutex identity changed; publication refused.');
  await validateHeader(temporary,identity);
  try{await link(temporary,mutex);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 }finally{
  if(sql?.isOpen)sql.close();
  if(identity)await removeOwnTemporary(temporary,identity);
 }
}

/** Держит OS SQLite exclusive lock до закрытия PGlite; предметные данные в mutex не хранятся. */
export async function acquireProfileOwner(dataDir:string){
 if(dataDir==='memory://')return {release:async()=>undefined};
 await mkdir(dataDir,{recursive:true});
 if((await lstat(dataDir)).isSymbolicLink())throw new Error('Profile directory symbolic link is refused.');
 const canonical=await realpath(dataDir),mutex=canonical+'.ouro-profile-mutex.sqlite';
 const localPath=process.platform==='win32'?mutex.toLowerCase():mutex;
 if(localPaths.has(localPath))throw alreadyOwned();
 localPaths.add(localPath);
 let sql:DatabaseSync|undefined,localInode:string|undefined;
 const releaseLocal=()=>{localPaths.delete(localPath);if(localInode)localInodes.delete(localInode);};
 try{
  for(const suffix of ['-journal','-wal','-shm'])await inspectFile(mutex+suffix);
  if(!await inspectFile(mutex))await publishMarker(mutex);
  const identity=await inspectFile(mutex);if(!identity)throw new Error('Profile mutex identity is unavailable.');
  const inodeKey=identity.dev+':'+identity.ino;
  if(localInodes.has(inodeKey))throw alreadyOwned();
  localInodes.add(inodeKey);localInode=inodeKey;
  await validateHeader(mutex,identity);
  for(const suffix of ['-journal','-wal','-shm'])await inspectFile(mutex+suffix);
  sql=new DatabaseSync(mutex,{timeout:0,allowExtension:false});
  validateDatabase(sql);
  sql.exec('BEGIN EXCLUSIVE');
  const current=await inspectFile(mutex);
  if(!sameIdentity(current,identity))throw new Error('Profile mutex identity changed; ownership refused.');
  let released=false;
  const owner=sql;
  return {async release(){if(released)return;owner.exec('ROLLBACK');owner.close();released=true;releaseLocal();}};
 }catch(error){
  if(sql?.isOpen)sql.close();
  releaseLocal();
  if(error instanceof Error&&error.message==='Embedded profile is already owned by another process.')throw error;
  const sqlite=error as {errcode?:number;code?:string};
  if(sqlite.errcode===5||sqlite.errcode===6)throw alreadyOwned();
  throw new Error('Profile mutex is not an Ouro marker or cannot be acquired.',{cause:error});
 }
}
