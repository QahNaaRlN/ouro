/** Материализует отдельный consumer envelope из одного producer commit. */
export function materializeConsumerEnvelope(options:{repository:string;ref:string;outputDirectory:string;npmCli:string}):Promise<{directory:string;commit:string}>;
/** Безопасный отказ producer envelope. */
export class ConsumerEnvelopeError extends Error{readonly code:'CONSUMER_ENVELOPE_FAILED';}
