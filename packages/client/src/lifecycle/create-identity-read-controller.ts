import {createClientCancellation} from './create-client-cancellation';
import type {ClientCancellationSignal} from '../ports';

/** Тип, описывающий результат чтения только текущего поколения identity. */
export type IdentityReadOutcome<T>={status:'accepted';value:T;accessEpoch:number}|{status:'failed';error:unknown;accessEpoch:number}|{status:'superseded'};
/**
 * Утилита, которая ограничивает ответы identity текущим поколением UI.
 * @returns Контроллер с отменой ожидания, монотонным access epoch и явным mount lifecycle.
 * @example
 * controller.mount(); const ticket=controller.begin(); controller.unmount();
 */
export function createIdentityReadController(){
 let mounted=false,generation=0,cancellation:ReturnType<typeof createClientCancellation>|undefined;
 return {
  mount:()=>{mounted=true;},
  unmount:()=>{mounted=false;generation++;cancellation?.abort();},
  begin:()=>{
   if(!mounted)return null;cancellation?.abort();const current=createClientCancellation(),accessEpoch=++generation;cancellation=current;
   const active=()=>mounted&&generation===accessEpoch;
   return {accessEpoch,run:async<T>(read:(signal:ClientCancellationSignal)=>Promise<T>):Promise<IdentityReadOutcome<T>>=>{
    try{const value=await read(current.signal);return active()?{status:'accepted',value,accessEpoch}:{status:'superseded'};}
    catch(error){return active()?{status:'failed',error,accessEpoch}:{status:'superseded'};}
   }};
  },
 };
}
