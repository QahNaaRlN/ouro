import {mkdir,realpath,lstat,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const applicationId=0x4f55524f,marker='ouro.embedded-profile-mutex/v1';

/** Проверяет файл до открытия SQLite; чужие файлы и symlink не изменяются. */
async function inspectFile(file:string){
 try{const value=await lstat(file,{bigint:true});if(value.isSymbolicLink()||!value.isFile()||value.size>65536n)throw new Error('Unsafe profile mutex file; symbolic links and foreign files are refused.');return value;}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
}

/** Держит OS SQLite exclusive lock до закрытия PGlite; предметные данные в mutex не хранятся. */
export async function acquireProfileOwner(dataDir:string){
 if(dataDir==='memory://')return {release:async()=>undefined};
 await mkdir(dataDir,{recursive:true});
 if((await lstat(dataDir)).isSymbolicLink())throw new Error('Profile directory symbolic link is refused.');
 const canonical=await realpath(dataDir),mutex=canonical+'.ouro-profile-mutex.sqlite';
 for(const suffix of ['-journal','-wal','-shm'])await inspectFile(mutex+suffix);
 let identity=await inspectFile(mutex),created=false,initialized=false,sql:DatabaseSync|undefined;
 if(!identity){
  try{const handle=await open(mutex,'wx',0o600);await handle.close();created=true;}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  identity=await inspectFile(mutex);
 }
 if(!identity)throw new Error('Profile mutex identity is unavailable.');
 if(!created){
  const handle=await open(mutex,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const header=Buffer.alloc(100),checked=await handle.stat({bigint:true}),{bytesRead}=await handle.read(header,0,100,0);
   if(checked.dev!==identity.dev||checked.ino!==identity.ino||bytesRead!==100||header.subarray(0,16).toString('binary')!=='SQLite format 3\0'||header.readUInt32BE(68)!==applicationId||header[18]!==1||header[19]!==1)throw new Error('File is not an initialized Ouro profile mutex.');
  }finally{await handle.close();}
 }
 try{
  sql=new DatabaseSync(mutex,{timeout:0,allowExtension:false});
  if(created){
   sql.exec(`PRAGMA journal_mode=DELETE;BEGIN EXCLUSIVE;PRAGMA application_id=${applicationId};CREATE TABLE ouro_profile_mutex(kind TEXT NOT NULL);INSERT INTO ouro_profile_mutex(kind) VALUES('${marker}');COMMIT;`);
   initialized=true;
  }
  const mode=sql.prepare('PRAGMA journal_mode').get(),id=sql.prepare('PRAGMA application_id').get();
  if(mode?.journal_mode!=='delete'||id?.application_id!==applicationId)throw new Error('File is not an Ouro profile mutex.');
  const schema=sql.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const rows=sql.prepare('SELECT kind FROM ouro_profile_mutex').all();
  if(schema.length!==1||schema[0]?.name!=='ouro_profile_mutex'||rows.length!==1||rows[0]?.kind!==marker)throw new Error('File is not an Ouro profile mutex.');
  sql.exec('BEGIN EXCLUSIVE');
  const current=await inspectFile(mutex);
  if(!current||current.dev!==identity.dev||current.ino!==identity.ino)throw new Error('Profile mutex identity changed; ownership refused.');
  let released=false;
  const owner=sql;
  return {async release(){if(released)return;owner.exec('ROLLBACK');owner.close();released=true;}};
 }catch(error){
  if(sql?.isOpen)sql.close();
  if(created&&!initialized){const current=await inspectFile(mutex);if(current?.dev===identity.dev&&current.ino===identity.ino)await unlink(mutex);}
  const sqlite=error as {errcode?:number;code?:string};
  if(sqlite.errcode===5||sqlite.errcode===6)throw new Error('Embedded profile is already owned by another process.');
  throw new Error('Profile mutex is not an Ouro marker or cannot be acquired.',{cause:error});
 }
}
