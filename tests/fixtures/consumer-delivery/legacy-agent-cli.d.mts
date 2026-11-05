export const LEGACY_AGENT_CLI_COMMIT:'29989b459387836e40bae454869dede998a7ebc8';
/** Создаёт isolated canonical oracle с exact SDK, не frontend build. */
export function prepareLegacyAgentCli(options:{repository:string;directory:string;npmCli:string}):Promise<{directory:string;commit:string}>;
