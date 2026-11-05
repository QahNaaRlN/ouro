import { validateNodeVersion } from './runtime-node.mjs';
import { readBuiltGeneration } from './consumer-delivery/generation-state.mjs';
import {
  AGENT_TOOL_PATHS,
  AGENT_TOOL_EXPORTS,
  AGENT_TOOL_GENERATION_PATHS,
  readAgentToolSupplement,
  selectAgentToolArguments,
  ConsumerAgentToolError,
} from './consumer-delivery/agent-tool-contract.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** Вызывает один из трёх fixed mains; selector не даёт URL/credential/process authority. */
export async function runConsumerAgentTool({ root, tool, argv = process.argv.slice(2) }) {
  validateNodeVersion(process.versions.node);
  if (!Object.hasOwn(AGENT_TOOL_PATHS, tool)) throw new ConsumerAgentToolError();
  const selected = selectAgentToolArguments(argv);
  if (
    tool === 'mcp-bridge' &&
    selected.argv.length &&
    !(selected.argv.length === 1 && selected.argv[0] === '--help')
  )
    throw new ConsumerAgentToolError();
  let entry, productVersion;
  if (selected.generation) {
    const generation = await readBuiltGeneration(root, selected.generation);
    entry = path.join(generation.directory, AGENT_TOOL_GENERATION_PATHS[tool]);
    if (tool === 'mcp-bridge') {
      process.argv = [process.execPath, entry, ...selected.argv];
      await import(pathToFileURL(entry).href);
      return process.exitCode ?? 0;
    }
  } else {
    const supplement = await readAgentToolSupplement(root);
    root = supplement.root;
    entry = path.join(root, AGENT_TOOL_PATHS[tool]);
    productVersion = supplement.descriptor.productVersion;
  }
  const module = await import(pathToFileURL(entry).href),
    main = module[AGENT_TOOL_EXPORTS[tool]];
  if (typeof main !== 'function') throw new ConsumerAgentToolError();
  if (tool === 'agent-config')
    return main({
      argv: selected.argv,
      stdioCommand: process.execPath,
      stdioArgs: [
        path.join(root, 'packages/mcp/bin/ouro-mcp.mjs'),
        ...(selected.generation ? ['--generation', selected.generation] : []),
      ],
    });
  if (tool === 'agent-check') return main({ environment: process.env });
  return main({ argv: selected.argv, environment: process.env, productVersion });
}
