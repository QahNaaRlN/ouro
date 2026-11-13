import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAgentTools } from '../scripts/consumer-delivery/build-agent-tools.mjs';
import type {
  CommittedConsumerSource,
  CommittedSourceFile,
} from '../scripts/consumer-delivery/committed-source.mjs';

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const input = (name: string, bytes: string): CommittedSourceFile => ({
  path: name,
  bytes: Buffer.from(bytes),
  sha256: digest(bytes),
  blob: 'a'.repeat(40),
  mode: '100644',
});

/** Инъецирует конечные producer counterexamples, не заменяет real SDK qualification. */
async function fixture(mode: 'mutate' | 'postcompile' | 'ancestor' | 'external' | 'realpath') {
  const root = await mkdtemp(path.join(tmpdir(), 'ouro-cli-producer-')),
    sourceRoot = path.join(root, 'blueprint'),
    outputRoot = path.join(root, 'output');
  await mkdir(sourceRoot);
  await mkdir(outputRoot);
  const sourceFiles: { path: string; sha256: string; editable: boolean }[] = [];
  for (const [relative, content] of Object.entries({
    'package.json': '{"name":"own-tool-fixture","type":"module"}',
    'package-lock.json': '{}',
    'scripts/agent-config.ts': 'export const fixture=1;',
    'scripts/check-agent.mjs': 'export const fixture=2;',
    'packages/mcp/bin/ouro-mcp.mjs': 'export const fixture=3;',
  })) {
    await mkdir(path.dirname(path.join(sourceRoot, relative)), { recursive: true });
    await writeFile(path.join(sourceRoot, relative), content);
    sourceFiles.push({ path: relative, sha256: digest(content), editable: false });
  }
  const outputCode = `import fs from 'node:fs';import path from 'node:path';${mode === 'ancestor' ? `fs.writeFileSync(${JSON.stringify(path.join(root, 'ancestor-imported'))},'executed');` : ''}export async function build(options){fs.mkdirSync(options.outdir,{recursive:true});fs.writeFileSync(${JSON.stringify(path.join(root, 'compiler-built'))},'built');for(const id of ['agent-config','agent-check','mcp-bridge'])fs.writeFileSync(path.join(options.outdir,id+'.mjs'),'export const fixture=1;');return {metafile:{inputs:{${JSON.stringify(mode === 'realpath' ? 'node_modules/escaped-input/input.js' : 'scripts/check-agent.mjs')}:{}},outputs:{'tool-dist/agent-config.mjs':{imports:[{path:${JSON.stringify(mode === 'external' ? 'unowned-runtime' : 'node:fs')},external:true}]}}}};}`;
  const ownCompiler = `const fs=require('node:fs'),path=require('node:path');const target=path.join(process.cwd(),'node_modules/esbuild');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'package.json'),'${JSON.stringify({ name: 'esbuild', type: 'module', exports: './index.js' })}');fs.writeFileSync(path.join(target,'index.js'),${JSON.stringify(outputCode)});`;
  let npmScript = mode === 'ancestor' ? '' : ownCompiler;
  if (mode === 'ancestor') {
    await mkdir(path.join(root, 'node_modules/esbuild'), { recursive: true });
    await writeFile(
      path.join(root, 'node_modules/esbuild/package.json'),
      JSON.stringify({ name: 'esbuild', type: 'module', exports: './index.js' }),
    );
    await writeFile(path.join(root, 'node_modules/esbuild/index.js'), outputCode);
  }
  if (mode === 'mutate')
    npmScript = "require('node:fs').writeFileSync('scripts/check-agent.mjs','MUTATED_AFTER_COPY');";
  if (mode === 'realpath') {
    const outside = path.join(root, 'outside-input');
    await mkdir(outside);
    await writeFile(path.join(outside, 'input.js'), 'OWN_OUTSIDE_INPUT');
    npmScript += `fs.symlinkSync(${JSON.stringify(outside)},path.join(process.cwd(),'node_modules/escaped-input'),${JSON.stringify(process.platform === 'win32' ? 'junction' : 'dir')});`;
  }
  const npmCli = path.join(root, 'npm-cli.js');
  await writeFile(npmCli, npmScript);
  const recipe =
    mode === 'mutate' || mode === 'postcompile'
      ? `import fs from 'node:fs';fs.writeFileSync('../compiler-attempt','executed');${mode === 'postcompile' ? "fs.writeFileSync('scripts/check-agent.mjs','MUTATED_DURING_COMPILE');" : ''}fs.mkdirSync('tool-dist');for(const id of ['agent-config','agent-check','mcp-bridge'])fs.writeFileSync('tool-dist/'+id+'.mjs','export const fixture=1;');fs.writeFileSync('tool-dist/inputs.json',JSON.stringify([{path:'scripts/check-agent.mjs'}]));`
      : await readFile(
          fileURLToPath(
            new URL('../release/consumer/build-agent-tools.mjs.template', import.meta.url),
          ),
          'utf8',
        );
  const source: CommittedConsumerSource = {
    commit: 'a'.repeat(40),
    productVersion: '0.1.0-beta.4',
    protocolVersion: '0.3.0',
    consumerFiles: [],
    protocolFiles: [],
    protocolProducerFiles: [],
    qualificationFiles: [],
    envelopeFiles: [],
    agentToolFiles: [
      input('scripts/agent-config.ts', 'fixture'),
      input('scripts/check-agent.mjs', 'fixture'),
    ],
    deliveryFiles: [input('release/consumer/build-agent-tools.mjs.template', recipe)],
  };
  return {
    root,
    run: () =>
      buildAgentTools({ source, sourceRoot, sourceFiles, outputRoot, scratchRoot: root, npmCli }),
    close: async () => {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
      assert(path.basename(root).startsWith('ouro-cli-producer-'));
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const mode of ['mutate', 'postcompile', 'ancestor', 'external', 'realpath'] as const)
  test(
    'CAP ' + mode + ' is rejected before publishing same-commit self-contained tools',
    async () => {
      const f = await fixture(mode);
      try {
        await assert.rejects(f.run, { code: 'CONSUMER_AGENT_TOOL_UNAVAILABLE' });
        if (mode === 'mutate' || mode === 'ancestor')
          await assert.rejects(
            () =>
              lstat(
                path.join(f.root, mode === 'mutate' ? 'compiler-attempt' : 'ancestor-imported'),
              ),
            (error) =>
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'ENOENT',
          );
        else
          assert.equal(
            await readFile(
              path.join(f.root, mode === 'postcompile' ? 'compiler-attempt' : 'compiler-built'),
              'utf8',
            ),
            mode === 'postcompile' ? 'executed' : 'built',
            'Fixture compiler must actually reach the tested metadata boundary',
          );
      } finally {
        await f.close();
      }
    },
  );
