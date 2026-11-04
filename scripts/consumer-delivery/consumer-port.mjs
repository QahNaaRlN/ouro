/** Отказывает без echo исходного PORT/CLI value. */
export class ConsumerPortError extends Error{constructor(code='CONSUMER_PORT_INVALID'){super('Invalid consumer port.');this.name='ConsumerPortError';this.code=code;}}
const reserved=new Set([1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
/** Сохраняет browser-port refusal установленного Next16.4.3 до env/profile, без его runtime dependency. */
export function assertBrowserPort(port){if(reserved.has(port))throw new ConsumerPortError('CONSUMER_PORT_RESERVED');}
/** Сохраняет nonnegative parseInt старого start; range failure остаётся до env/profile. */
export function parseStartPort(value){const parsed=Number.parseInt(value,10);if(!Number.isSafeInteger(parsed)||parsed<0||parsed>65535)throw new ConsumerPortError();return parsed;}
/** Замораживает CLI/process/default authority до чтения environment files. */
export function selectConsumerPort(mode,explicit,inherited){
 if(!['launch','start'].includes(mode))throw new ConsumerPortError();const selected=explicit??(mode==='launch'?3000:inherited===undefined?3000:parseStartPort(inherited));if(!Number.isSafeInteger(selected)||selected<(mode==='launch'?1:0)||selected>65535)throw new ConsumerPortError();return selected;
}
