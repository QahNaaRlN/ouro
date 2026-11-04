export type RuntimeEnvironmentPhase='production'|'development';
export type RuntimeEnvironmentDiagnostic={code:'ENVIRONMENT_FILE_READ_FAILED'|'ENVIRONMENT_FILE_EXPANSION_FAILED';file:string};
export type RuntimeEnvironmentResult={mode:'production'|'development'|'test';loadedFiles:string[];diagnostics:RuntimeEnvironmentDiagnostic[]};
export class RuntimeEnvironmentError extends Error {readonly code:'RUNTIME_ENVIRONMENT_INVALID'|'RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE';constructor(code:'RUNTIME_ENVIRONMENT_INVALID'|'RUNTIME_ENVIRONMENT_PARSER_UNAVAILABLE');}
export function loadRuntimeEnvironment(options:{root:string;phase:RuntimeEnvironmentPhase}):Promise<RuntimeEnvironmentResult>;
