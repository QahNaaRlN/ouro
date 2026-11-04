export const applicationNodeEngine: '>=24.19.0 <25';
export class NodeRuntimeUnsupportedError extends Error { readonly code: 'NODE_RUNTIME_UNSUPPORTED'; constructor(); }
export function validateNodeVersion(version: unknown): void;
