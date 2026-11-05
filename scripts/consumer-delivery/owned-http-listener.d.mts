import type {PreboundHttpListener} from '../../apps/service/src/bootstrap/prebound-listener.types.js';
/** Безопасный отказ раннего listener. */
export class BootstrapListenerError extends Error{readonly code:string;constructor(code?:string);}
/** Создаёт только собственный loopback listener; startup caps не действуют после adoption. */
export function bindOwnedHttpListener(options:{port:number;host?:'127.0.0.1'|'::1';maxPendingRequests?:number;maxConnections?:number;startupTimeoutMs?:number}):Promise<PreboundHttpListener>;
