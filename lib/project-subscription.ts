import type { ProjectSnapshot, ProjectSnapshotAdopter, SnapshotAdoption } from './project-snapshot';

export type ProjectSubscriptionStatus = 'connecting'|'connected'|'reconnecting'|'reload-required';
export type ProjectEventSource = {
  readonly readyState:number;
  onopen:((event:Event)=>unknown)|null;
  onerror:((event:Event)=>unknown)|null;
  addEventListener(type:string,listener:EventListenerOrEventListenerObject):void;
  removeEventListener(type:string,listener:EventListenerOrEventListenerObject):void;
  close():void;
};
export type ProjectSubscriptionOptions = {
  adopter:ProjectSnapshotAdopter;
  onSnapshot:(snapshot:ProjectSnapshot,result:Exclude<SnapshotAdoption,{status:'invalid'}>)=>void;
  onStatus:(status:ProjectSubscriptionStatus,reason?:string)=>void;
  createEventSource?:(url:string)=>ProjectEventSource;
  reconcile?:()=>Promise<unknown>;
  schedule?:(callback:()=>void,delayMs:number)=>unknown;
  cancelSchedule?:(token:unknown)=>void;
};
/** Same-origin cookie auth; URL parameters contain only the committed cursor. */
export function startProjectSubscription(options:ProjectSubscriptionOptions) {
  const createSource=options.createEventSource??(url=>new EventSource(url));
  const schedule=options.schedule??((callback,delay)=>setTimeout(callback,delay));
  const cancelSchedule=options.cancelSchedule??(token=>clearTimeout(token as ReturnType<typeof setTimeout>));
  let source:ProjectEventSource|null=null,listener:EventListener|null=null,retryTimer:unknown;
  let closed=false,halted=false,generation=0,recoveryAttempts=0;
  let reconciliation:Promise<void>|undefined;
  const status=(value:ProjectSubscriptionStatus,reason?:string)=>{if(!closed)options.onStatus(value,reason);};
  const clearRetry=()=>{if(retryTimer!==undefined){cancelSchedule(retryTimer);retryTimer=undefined;}};
  const disconnect=()=>{
    generation++;
    if(source){if(listener)source.removeEventListener('snapshot',listener);source.onopen=null;source.onerror=null;source.close();}
    source=null;listener=null;
  };
  const requireReload=(reason:string)=>{if(closed||halted)return;halted=true;clearRetry();disconnect();status('reload-required',reason);};
  const notify=(result:Exclude<SnapshotAdoption,{status:'invalid'}>):boolean=>{
    if(result.status==='stale')return true;
    try{
      // Applying a full snapshot must finish before the event callback returns.
      // EventSource already advanced its own Last-Event-ID before dispatch.
      const returned=options.onSnapshot(result.snapshot,result) as unknown;
      if(returned&&typeof (returned as {then?:unknown}).then==='function')throw new Error('Snapshot callback must be synchronous');
      return true;
    }catch{requireReload('snapshot-application-failed');return false;}
  };
  const recover=(reason:string)=>{
    if(closed||halted)return;
    clearRetry();disconnect();recoveryAttempts++;
    if(recoveryAttempts>5){requireReload(reason);return;}
    status('reconnecting',reason);
    retryTimer=schedule(()=>{retryTimer=undefined;if(!closed&&!halted)open();},Math.min(250*2**(recoveryAttempts-1),5000));
  };
  const reconcile=(epoch:number):Promise<void>=>{
    if(reconciliation)return reconciliation;
    if(!options.reconcile||closed||halted)return Promise.resolve();
    const cursorAtStart=options.adopter.getSnapshot()?.cursor??0;
    const read=options.reconcile;
    const operation=(async()=>{
      try{
        const value=await read();
        if(closed||halted||generation!==epoch)return;
        const checked=options.adopter.inspect(value);
        if(!checked.valid){requireReload(checked.reason);return;}
        // Compare against the cursor when this GET began. A newer SSE received
        // while awaiting it makes the GET stale, not proof of a server rollback.
        if(checked.snapshot.cursor<cursorAtStart){requireReload('server-cursor-reset');return;}
        const result=options.adopter.adopt(checked.snapshot);
        if(result.status==='invalid'){requireReload(result.reason);return;}
        notify(result);
    }catch{
      // onerror already announced reconnecting. An older failed GET must not
      // overwrite a valid snapshot that reconnected this same native source.
      }
    })();
    const pending=operation.finally(()=>{if(reconciliation===pending)reconciliation=undefined;});
    reconciliation=pending;
    return pending;
  };
  const open=()=>{
    if(closed||halted)return;
    status(recoveryAttempts?'reconnecting':'connecting');
    const epoch=++generation;
    let current:ProjectEventSource;
    try{current=createSource(`/api/stream?after=${options.adopter.getSnapshot()?.cursor??0}`);source=current;}
    catch{recover('stream-open-failed');return;}
    const active=()=>!closed&&!halted&&generation===epoch&&source===current;
    listener=(event:Event)=>{
      if(!active())return;
      let value:unknown;
      try{value=JSON.parse((event as MessageEvent<string>).data);}catch{recover('malformed-snapshot');return;}
      const checked=options.adopter.inspect(value);
      if(!checked.valid){recover(checked.reason);return;}
      if((event as MessageEvent<string>).lastEventId!==String(checked.snapshot.cursor)){recover('event-id-mismatch');return;}
      const result=options.adopter.adopt(checked.snapshot);
      if(result.status==='invalid'){recover(result.reason);return;}
      if(!notify(result)||!active())return;
      if(result.status!=='stale'){recoveryAttempts=0;status('connected');}
    };
    current.addEventListener('snapshot',listener);
    // An open TCP/HTTP stream is not yet confirmed application state.
    current.onopen=()=>{};
    current.onerror=()=>{
      if(!active())return;
      status('reconnecting','stream-disconnected');
      // Normal native reconnection preserves Last-Event-ID. A terminal HTTP
      // failure exposes no status in EventSource; reconcile before rebuilding.
      void reconcile(epoch).then(()=>{if(active()&&current.readyState===2)recover('stream-closed');});
    };
  };
  open();
  return {
    close(){if(closed)return;closed=true;clearRetry();disconnect();},
    reconnect(){if(closed||halted)return;clearRetry();disconnect();recoveryAttempts=0;open();},
  };
}
