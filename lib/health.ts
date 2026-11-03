type HealthStore={inspect(sql:string):Promise<unknown>};
export async function checkHealth(getStore:()=>Promise<HealthStore>,storage:string,timeoutMs=4000):Promise<Response>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([(async()=>{await(await getStore()).inspect('SELECT 1');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness timeout')),timeoutMs);})]);
  return Response.json({status:'ok',storage},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
 finally{if(timer)clearTimeout(timer);}
}
