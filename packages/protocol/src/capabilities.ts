import {PROTOCOL_VERSION} from './version.js';

export const VERIFICATION_CAPABILITIES=['verification.v1','verification.cycles.v1','verification.observation.v1','verification.local-runner.v1','verification.manual.v1','verification.mutation.v1'] as const;
export const SUPPORTED_CLIENT_VERSIONS=['0.1.2','0.2.0',PROTOCOL_VERSION] as const;
/** Optional negotiation preserves old tool arguments; explicit incompatible demands fail closed. */
export function negotiateProtocol(input:{protocolVersion?:string;requiredCapabilities?:string[]}){
 if(input.protocolVersion&&!SUPPORTED_CLIENT_VERSIONS.some(version=>version===input.protocolVersion))throw Object.assign(new Error('Unsupported Ouro client contract version.'),{code:'UNSUPPORTED_CONTRACT_VERSION'});
 const available:string[]=input.protocolVersion&&input.protocolVersion!==PROTOCOL_VERSION?[]:[...VERIFICATION_CAPABILITIES];
 if(input.requiredCapabilities?.some(capability=>!available.includes(capability)))throw Object.assign(new Error('Required Ouro capability is not available for the requested client contract.'),{code:'UNSUPPORTED_CAPABILITY'});
 return {version:PROTOCOL_VERSION,clientVersion:input.protocolVersion??PROTOCOL_VERSION,capabilities:available};
}
