import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Создаёт controlled actual-npm lifecycle; fake build нужен только для process/state causality. */
export async function createControlledNpmEnvelope(npmCli) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-generation-process-')),
    root = path.join(directory, 'delivery & данные'),
    foreign = path.join(directory, 'foreign cwd');
  await mkdir(root);
  await mkdir(foreign);
  await mkdir(path.join(root, 'source'));
  const artifacts = {
    'apps/web/dist/index.html': '<div id="root"></div>',
    'apps/service/dist/index.mjs': 'export {};',
    'apps/service/dist/main.mjs': 'export {};',
    'apps/service/dist/resources/migrations/001_init.sql': 'SELECT 1;',
    'apps/service/dist/resources/verification/playwright-preload.mjs': 'export {};',
    'apps/service/dist/resources/mcp/bin/ouro-mcp.mjs': 'export {};',
  };
  const metadata = {
      name: 'owned-generation-process-fixture',
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: { postinstall: 'node postinstall.cjs' },
    },
    lock = {
      name: metadata.name,
      version: metadata.version,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: metadata.name, version: metadata.version, hasInstallScript: true } },
    };
  const files = {
    'package.json': JSON.stringify(metadata),
    'package-lock.json': JSON.stringify(lock),
    'postinstall.cjs': `const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');fs.writeFileSync('.observed-ci.json',JSON.stringify({command:process.env.npm_command,include:process.env.npm_config_include,nodeEnv:process.env.NODE_ENV,cwd:process.cwd()}));if(process.env.OWN_CGL_MODE==='block'){spawn(process.execPath,[path.join(__dirname,'writer.cjs'),process.env.OWN_CGL_NONCE,String(process.pid),String(process.ppid)],{cwd:process.cwd(),env:process.env,detached:true,windowsHide:true,stdio:'ignore',shell:false}).unref();const timer=setInterval(()=>{if(fs.existsSync('.writer-stopped'))clearInterval(timer);},30);}`,
    'writer.cjs': `const fs=require('node:fs'),http=require('node:http'),nonce=process.argv[2],installOwnerPid=Number(process.argv[3]),installShellPid=Number(process.argv[4]);fs.writeFileSync('.heartbeat','0');const timer=setInterval(()=>fs.appendFileSync('.heartbeat','x'),25);const server=http.createServer((req,res)=>{if(req.url==='/probe/'+nonce){res.end(JSON.stringify({nonce,pid:process.pid}));}else if(req.method==='POST'&&req.url==='/stop/'+nonce){clearInterval(timer);fs.writeFileSync('.writer-stopped','closed');res.end('closed');server.close();}else{res.statusCode=404;res.end();}});server.listen(0,'127.0.0.1',()=>fs.writeFileSync('.writer-ready.json',JSON.stringify({nonce,pid:process.pid,installOwnerPid,installShellPid,port:server.address().port})));`,
    'scripts/build-consumer.mjs': `import{mkdir,writeFile}from'node:fs/promises';import path from'node:path';export async function buildConsumer({sourceRoot}){for(const[file,bytes]of Object.entries(${JSON.stringify(artifacts)})){await mkdir(path.dirname(path.join(sourceRoot,file)),{recursive:true});await writeFile(path.join(sourceRoot,file),bytes);}}`,
  };
  const sourceFiles = [];
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, 'source', file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    sourceFiles.push({
      path: file,
      sha256: createHash('sha256').update(content).digest('hex'),
      editable: false,
    });
  }
  await writeFile(
    path.join(root, 'consumer-envelope.json'),
    JSON.stringify({
      schemaVersion: 1,
      scope: 'CONSUMER_GENERATION_ENVELOPE',
      sourceCommit: 'a'.repeat(40),
      productVersion: '0.1.0-beta.4',
      protocolVersion: '0.3.0',
      sourceFiles,
    }),
  );
  for (const file of [
    'scripts/runtime-node.mjs',
    'scripts/consumer-launch.mjs',
    'scripts/consumer-worker.mjs',
    'scripts/consumer-delivery/consumer-owner.mjs',
    'scripts/consumer-delivery/generation-state.mjs',
    'scripts/consumer-delivery/consumer-port.mjs',
    'scripts/consumer-delivery/owned-http-listener.mjs',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(
      fileURLToPath(new URL('../../../' + file, import.meta.url)),
      path.join(root, file),
    );
  }
  const npmWitness = path.join(directory, 'pinned-npm-witness.mjs');
  await writeFile(
    npmWitness,
    `import{writeFileSync}from'node:fs';import{pathToFileURL}from'node:url';writeFileSync('.npm-owner.json',JSON.stringify({pid:process.pid,nonce:process.env.OWN_CGL_NONCE}));const actual=${JSON.stringify(npmCli)};process.argv=[process.execPath,actual,...process.argv.slice(2)];await import(pathToFileURL(actual).href);`,
  );
  return {
    directory,
    root,
    foreign,
    npmWitness,
    close: async () => {
      if (
        path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
        !path.basename(directory).startsWith('ouro-generation-process-')
      )
        throw Error('Refused foreign process fixture cleanup');
      await rm(directory, { recursive: true, force: true });
    },
  };
}
