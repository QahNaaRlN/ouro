export type ConsumerGeneration={id:string;directory:string};
/** Безопасный отказ admission собственного install tree. */
export class ConsumerGenerationError extends Error{readonly code:string;constructor(code?:string);}
/** Выделяет отдельный install tree без переиспользования предыдущего поколения. */
export function allocateGeneration(root:string):Promise<ConsumerGeneration>;
/** Проверяет blueprint до side effects подготовки. */
export function admitConsumerEnvelope(root:string):Promise<string>;
export type ConsumerSnapshot={sourceCommit:string;digest:string;files:Array<{path:string;sha256:string;shippedSha256:string}>};
/** Копирует только конечные source inputs, сохраняя effective hashes. */
export function snapshotGeneration(root:string,generation:ConsumerGeneration):Promise<ConsumerSnapshot>;
/** Публикует immutable BUILT record после подтверждённого завершения сборки. */
export function publishBuiltGeneration(root:string,generation:ConsumerGeneration,snapshot:ConsumerSnapshot):Promise<ConsumerGeneration>;
/** Проверяет pointer/record/artifact перед выбором runtime. */
export function readBuiltGeneration(root:string,id?:string):Promise<ConsumerGeneration>;
