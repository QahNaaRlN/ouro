/** Управляет единственным recovery timer и кооперативным выполнением durable worker. */
export function createOwnedGitHubWorker(options:{enabled:boolean;run:(signal:AbortSignal)=>Promise<unknown>;intervalMs?:number}){
 const controller=new AbortController();
 let timer:ReturnType<typeof setInterval>|undefined,startup:ReturnType<typeof setTimeout>|undefined,running:Promise<void>|undefined,stopping:Promise<void>|undefined;
 const kick=(signal?:AbortSignal):Promise<void>=>{
  if(!options.enabled||controller.signal.aborted||signal?.aborted)return Promise.resolve();
  if(running)return running;
  const combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  running=Promise.resolve().then(()=>options.run(combined)).then(()=>undefined).finally(()=>{running=undefined;});
  return running;
 };
 return {kick,start(){if(timer||controller.signal.aborted||!options.enabled)return;const recover=()=>{void kick().catch(()=>undefined);};timer=setInterval(recover,options.intervalMs??5000);timer.unref();startup=setTimeout(recover,0);startup.unref();},stop(){if(!stopping){controller.abort();if(timer)clearInterval(timer);if(startup)clearTimeout(startup);stopping=(running??Promise.resolve()).catch(()=>undefined);}return stopping;}};
}
