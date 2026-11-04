import type {Server,RequestListener} from 'node:http';
import type {AddressInfo,Socket} from 'node:net';

/** Структурный owner одного раннего Node listener; интерфейс не зависит от module identity. */
export type PreboundHttpListener={
 readonly server:Server;
 readonly address:Readonly<AddressInfo>;
 readonly url:string;
 readonly state:'PREBOUND'|'ADOPTED'|'CLOSED';
 currentSockets():readonly Socket[];
 adopt(listener:RequestListener):void;
 closeIfUnadopted():Promise<boolean>;
};
