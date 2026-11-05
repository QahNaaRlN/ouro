/** Три committed текстовых input; canonical manifest приходит из того же source commit. */
export type ProtocolProducerDependencyOptions = Readonly<{
  manifest: string;
  lockfile: string;
  metadata: string;
}>;
/** Проверенный npm lock без изменения registry tuples и без побочных эффектов. */
export type ProtocolProducerDependencies = { lockfile: string };
/** Единый безопасный отказ без содержимого input или parser diagnostics. */
export class ProtocolProducerDependencyError extends Error {
  readonly code: 'PROTOCOL_PRODUCER_DEPENDENCY_INVALID';
  constructor();
}
/** Проверяет portable identity, hashes и registry graph до любых FS/install effects. */
export function materializeProtocolProducerDependencies(
  options: ProtocolProducerDependencyOptions,
): ProtocolProducerDependencies;
