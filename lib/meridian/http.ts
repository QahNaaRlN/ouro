import {AccessError,assertHuman,assertJsonWrite,authenticatedParticipant,assertExpectedParticipant} from '../auth';
import {apiError} from '../http';
import {importMeridianScope,type CommandResult} from '../store';
import {AGENT_ID,PROJECT_ID,type Actor} from '../../packages/core/src';

const MAX_BODY_BYTES=2*1024*1024;
export type MeridianImportDependencies={
 authenticateHuman?:(request:Request)=>Actor|Promise<Actor>;
 importScope?:(body:unknown,actor:Actor)=>Promise<CommandResult>;
};
/** The dedicated envelope budget includes JSON escaping of <=512KiB source.
 * Bytes are bounded while reading, including requests without Content-Length.
 * Generic command routes retain their existing, smaller limit.
 */
async function readImportBody(request:Request):Promise<unknown>{
 assertJsonWrite(request,MAX_BODY_BYTES);
 const reader=request.body?.getReader();if(!reader)throw new AccessError('VALIDATION_ERROR','Не передано тело импорта.',400);
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY_BYTES){await reader.cancel();throw new AccessError('PAYLOAD_TOO_LARGE','Импорт превышает 2 MiB.',413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}
 catch{throw new AccessError('VALIDATION_ERROR','Некорректный JSON или UTF-8 импорта.',400);}
}
export function createMeridianImportHandler(dependencies:MeridianImportDependencies={}){
 const authenticate=dependencies.authenticateHuman??(request=>authenticatedParticipant(request,PROJECT_ID,AGENT_ID));
 const ingest=dependencies.importScope??importMeridianScope;
 return async(request:Request)=>{
  try{
   const actor=await authenticate(request);assertHuman(actor);
   // Keep this check for injected authentication adapters as well.
   assertExpectedParticipant(request,actor);
   const result=await ingest(await readImportBody(request),actor);
   return Response.json(result,{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
   if(error instanceof AccessError)return apiError(error);
   const code=(error as {code?:unknown})?.code;
   if(typeof code==='string'&&/CONFLICT|ALREADY_RESOLVED|CURSOR_AHEAD|FORBIDDEN|NOT_FOUND|VALIDATION|TRANSITION|LIMIT|DEPENDENCY_CYCLE/.test(code))return apiError(error);
   // Database exceptions may contain query arguments. Keep source documents out
   // of transport responses and logs; the original source remains in its fact.
   return Response.json({error:{code:'INTERNAL_ERROR',message:'Результат импорта не подтверждён. Повторите тот же запрос для получения квитанции.'}},{status:500,headers:{'Cache-Control':'no-store'}});
  }
 };
}
