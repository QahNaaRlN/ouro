import {validateNodeVersion} from './runtime-node.mjs';
import {runConsumerAgentTool} from './consumer-agent-cli.mjs';

/** Сохраняет caller cwd/credentials; issued selector связывает bridge с обслуживающим поколением. */
export async function runConsumerMcp({root,argv=process.argv.slice(2)}){
 validateNodeVersion(process.versions.node);process.exitCode=await runConsumerAgentTool({root,tool:'mcp-bridge',argv});
}
