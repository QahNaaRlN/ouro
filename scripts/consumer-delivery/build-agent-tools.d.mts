import type {CommittedConsumerSource} from './committed-source.mjs';
import type {AgentToolDescriptor} from './agent-tool-contract.mjs';
/** Создаёт supplement без записи в source blueprint или existing generation. */
export function buildAgentTools(options:{source:CommittedConsumerSource;sourceRoot:string;sourceFiles:{path:string;sha256:string;editable:boolean}[];outputRoot:string;scratchRoot:string;npmCli:string}):Promise<AgentToolDescriptor>;
