import {symlink} from 'node:fs/promises';

/** Windows may require Developer Mode or elevation; other filesystems must not hide failures. */
export async function createTestSymlink(target:string,destination:string,type?:Parameters<typeof symlink>[2]):Promise<boolean>{
 try{await symlink(target,destination,type);return true;}
 catch(error){
  if(process.platform==='win32'&&(error as NodeJS.ErrnoException).code==='EPERM')return false;
  throw error;
 }
}
