import { validateNodeVersion } from '../runtime-node.mjs';
import {
  mkdir,
  lstat,
  realpath,
  readFile,
  writeFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';

/** Сохраняет безопасный bootstrap diagnostic без конфигурации или filesystem payload. */
export class ConsumerGenerationError extends Error {
  constructor(code = 'CONSUMER_GENERATION_INVALID') {
    super('Consumer generation admission failed.');
    this.name = 'ConsumerGenerationError';
    this.code = code;
  }
}

const generationPattern = /^g-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  hashPattern = /^[a-f0-9]{64}$/,
  commitPattern = /^[a-f0-9]{40,64}$/;
const requiredArtifacts = [
  'apps/web/dist/index.html',
  'apps/service/dist/index.mjs',
  'apps/service/dist/main.mjs',
  'apps/service/dist/resources/verification/playwright-preload.mjs',
  'apps/service/dist/resources/mcp/bin/ouro-mcp.mjs',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Проверяет конечные относительные file identities, включая Windows aliases каждого prefix. */
function paths(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 4096)
    throw new ConsumerGenerationError();
  const seen = new Map();
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !hashPattern.test(file.sha256) ||
      file.path.length > 1000 ||
      /[\\\u0000-\u001f\u007f:]/.test(file.path)
    )
      throw new ConsumerGenerationError();
    const parts = file.path.split('/');
    if (
      parts.some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          part.startsWith('.env') ||
          ['node_modules', '.ouro', '.ouro-runtime', '.git'].includes(part.toLowerCase()),
      )
    )
      throw new ConsumerGenerationError();
    for (let index = 0; index < parts.length; index++) {
      const spelling = parts.slice(0, index + 1).join('/'),
        key = spelling.toLowerCase(),
        kind = index === parts.length - 1 ? 'file' : 'directory',
        prior = seen.get(key);
      if (prior && (prior.spelling !== spelling || prior.kind !== kind || kind === 'file'))
        throw new ConsumerGenerationError();
      if (!prior) seen.set(key, { spelling, kind });
    }
  }
  return files;
}

/** Проверяет каждый существующий path component без следования вложенным symlink/junction. */
async function inspect(root, relative, kind = 'file') {
  let filename = root;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    filename = path.join(filename, parts[index]);
    const stat = await lstat(filename);
    if (
      stat.isSymbolicLink() ||
      (index === parts.length - 1 && kind === 'file' ? !stat.isFile() : !stat.isDirectory())
    )
      throw new ConsumerGenerationError();
  }
  return filename;
}

/** Ограничивает чтение файла до выделения памяти и исключает ссылки. */
async function bytes(root, relative, maximum = 32 * 1024 * 1024) {
  const filename = await inspect(root, relative),
    stat = await lstat(filename);
  if (stat.size > maximum) throw new ConsumerGenerationError();
  return readFile(filename);
}

/** Читает только bounded metadata собственного envelope/runtime namespace. */
async function json(root, relative) {
  return JSON.parse((await bytes(root, relative, 1024 * 1024)).toString('utf8'));
}

/** Не допускает snapshot другого корня или ссылки на чужое поколение. */
async function generationDirectory(root, generation) {
  if (!generation || !generationPattern.test(generation.id)) throw new ConsumerGenerationError();
  const directory = await inspect(root, '.ouro-runtime/generations/' + generation.id, 'directory');
  if (generation.directory !== directory) throw new ConsumerGenerationError();
  return directory;
}

/** Связывает source blueprint с одним producer commit без чтения пользовательских файлов. */
async function envelope(root) {
  const manifest = await json(root, 'consumer-envelope.json');
  if (
    manifest.schemaVersion !== 1 ||
    manifest.scope !== 'CONSUMER_GENERATION_ENVELOPE' ||
    !commitPattern.test(manifest.sourceCommit) ||
    typeof manifest.productVersion !== 'string' ||
    typeof manifest.protocolVersion !== 'string'
  )
    throw new ConsumerGenerationError();
  paths(manifest.sourceFiles);
  if (manifest.sourceFiles.some((file) => typeof file.editable !== 'boolean'))
    throw new ConsumerGenerationError();
  return manifest;
}

/** Проверяет finite source blueprint до allocation/npm/config reads. */
export async function admitConsumerEnvelope(root) {
  validateNodeVersion(process.versions.node);
  return bounded(async () => {
    const canonical = await rootDirectory(root);
    await envelope(canonical);
    return canonical;
  });
}

/** Сохраняет однозначный digest конечного effective input inventory. */
function inputDigest(files) {
  return hash(JSON.stringify(files));
}

/** Не выпускает raw filesystem/parser failure за bootstrap boundary. */
async function bounded(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ConsumerGenerationError) throw error;
    const code = ['ENOENT', 'EEXIST', 'EPERM', 'EACCES', 'EBUSY', 'ENOTDIR'].includes(error?.code)
      ? 'CONSUMER_GENERATION_IO_' + error.code
      : 'CONSUMER_GENERATION_INVALID';
    throw new ConsumerGenerationError(code);
  }
}

/** Разрешает доверенный installed root один раз; вложенные runtime paths не принимают ссылки. */
async function rootDirectory(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || /[\u0000-\u001f\u007f]/.test(root))
    throw new ConsumerGenerationError();
  const canonical = await realpath(root);
  if (!(await lstat(canonical)).isDirectory()) throw new ConsumerGenerationError();
  return canonical;
}

/** Создаёт только конечный reviewed namespace, отклоняя чужие file/symlink компоненты. */
async function directory(root, parts) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ConsumerGenerationError();
  }
  return current;
}

/** Выделяет отдельный install tree; незавершённые поколения никогда не выбираются повторно. */
export async function allocateGeneration(root) {
  validateNodeVersion(process.versions.node);
  try {
    const canonical = await rootDirectory(root),
      parent = await directory(canonical, ['.ouro-runtime', 'generations']),
      id = 'g-' + randomUUID(),
      target = path.join(parent, id);
    await mkdir(target);
    return { id, directory: target };
  } catch (error) {
    if (error instanceof ConsumerGenerationError) throw error;
    throw new ConsumerGenerationError();
  }
}

/** Копирует только reviewed inputs в пустое новое поколение, сохраняя точные effective hashes. */
export async function snapshotGeneration(root, generation) {
  validateNodeVersion(process.versions.node);
  return bounded(async () => {
    const canonical = await rootDirectory(root),
      target = await generationDirectory(canonical, generation),
      manifest = await envelope(canonical);
    if ((await readdir(target)).length) throw new ConsumerGenerationError();
    await inspect(canonical, 'source', 'directory');
    const files = [];
    let total = 0;
    for (const file of manifest.sourceFiles) {
      const content = await bytes(canonical, 'source/' + file.path);
      total += content.length;
      if (total > 256 * 1024 * 1024) throw new ConsumerGenerationError();
      const sha256 = hash(content);
      if (!file.editable && sha256 !== file.sha256) throw new ConsumerGenerationError();
      await directory(target, file.path.split('/').slice(0, -1));
      await writeFile(path.join(target, file.path), content, { flag: 'wx' });
      files.push({ path: file.path, sha256, shippedSha256: file.sha256 });
    }
    return { sourceCommit: manifest.sourceCommit, digest: inputDigest(files), files };
  });
}

/** Перечисляет полное конечное build artifact tree; ссылки и неподдерживаемые entries запрещены. */
async function artifacts(root) {
  const result = [];
  let total = 0;
  async function visit(relative) {
    const filename = await inspect(root, relative, 'directory');
    for (const name of (await readdir(filename)).sort()) {
      const file = relative + '/' + name,
        stat = await lstat(path.join(root, file));
      if (stat.isSymbolicLink()) throw new ConsumerGenerationError();
      if (stat.isDirectory()) await visit(file);
      else if (stat.isFile()) {
        const content = await bytes(root, file);
        total += content.length;
        if (total > 256 * 1024 * 1024 || result.length >= 4096) throw new ConsumerGenerationError();
        result.push({ path: file, sha256: hash(content) });
      } else throw new ConsumerGenerationError();
    }
  }
  await visit('apps/web/dist');
  await visit('apps/service/dist');
  paths(result);
  for (const required of requiredArtifacts)
    if (!result.some((file) => file.path === required)) throw new ConsumerGenerationError();
  if (
    !result.some((file) =>
      /^apps\/service\/dist\/resources\/migrations\/\d+_[a-z_]+\.sql$/.test(file.path),
    )
  )
    throw new ConsumerGenerationError();
  return result;
}

/** Доказывает, что закрытый pointer temp сохранил собственную identity и точные bytes. */
async function samePointer(temporary, identity, content) {
  try {
    const stat = await lstat(temporary);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.dev !== identity.dev ||
      stat.ino !== identity.ino ||
      stat.size !== Buffer.byteLength(content)
    )
      return false;
    return hash(await readFile(temporary)) === hash(content);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/** Повторяет только Windows atomic rename того же verified temp; бизнес-команды не повторяются. */
async function replacePointer(temporary, destination, identity, content) {
  const until = performance.now() + 1000;
  for (let attempt = 0; ; attempt++) {
    if (!(await samePointer(temporary, identity, content)))
      throw new ConsumerGenerationError('CONSUMER_POINTER_TEMP_CHANGED');
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        !['EPERM', 'EBUSY'].includes(error?.code) ||
        attempt >= 40 ||
        performance.now() >= until
      )
        throw new ConsumerGenerationError(
          'CONSUMER_POINTER_RENAME_' +
            (['EPERM', 'EBUSY', 'EACCES'].includes(error?.code) ? error.code : 'FAILED'),
        );
      if (!(await samePointer(temporary, identity, content)))
        throw new ConsumerGenerationError('CONSUMER_POINTER_TEMP_CHANGED');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/** Публикует immutable BUILT record только после завершённой сборки; pointer не означает active owner. */
export async function publishBuiltGeneration(root, generation, snapshot) {
  validateNodeVersion(process.versions.node);
  return bounded(async () => {
    const canonical = await rootDirectory(root),
      target = await generationDirectory(canonical, generation),
      manifest = await envelope(canonical);
    paths(snapshot.files);
    if (
      snapshot.sourceCommit !== manifest.sourceCommit ||
      snapshot.digest !== inputDigest(snapshot.files)
    )
      throw new ConsumerGenerationError();
    if (
      snapshot.files.length !== manifest.sourceFiles.length ||
      snapshot.files.some(
        (file, index) =>
          file.path !== manifest.sourceFiles[index].path ||
          file.shippedSha256 !== manifest.sourceFiles[index].sha256,
      )
    )
      throw new ConsumerGenerationError();
    for (const file of snapshot.files)
      if (hash(await bytes(target, file.path)) !== file.sha256) throw new ConsumerGenerationError();
    try {
      await lstat(path.join(canonical, '.ouro-runtime', 'last-built.json'));
      await readBuiltGeneration(canonical);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const record = {
        schemaVersion: 1,
        stage: 'BUILT',
        generation: generation.id,
        sourceCommit: manifest.sourceCommit,
        productVersion: manifest.productVersion,
        protocolVersion: manifest.protocolVersion,
        inputDigest: snapshot.digest,
        artifacts: await artifacts(target),
      },
      content = JSON.stringify(record) + '\n';
    const records = await directory(canonical, ['.ouro-runtime', 'records']);
    await writeFile(path.join(records, generation.id + '.json'), content, {
      flag: 'wx',
      mode: 0o600,
    });
    const runtime = path.dirname(records),
      temporary = path.join(runtime, '.last-built-' + randomUUID() + '.tmp'),
      pointer =
        JSON.stringify({
          schemaVersion: 1,
          generation: generation.id,
          recordSha256: hash(content),
        }) + '\n';
    let own = false,
      identity;
    try {
      await writeFile(temporary, pointer, { flag: 'wx', mode: 0o600 });
      own = true;
      identity = await lstat(temporary);
      await replacePointer(temporary, path.join(runtime, 'last-built.json'), identity, pointer);
      own = false;
    } finally {
      if (own && identity && (await samePointer(temporary, identity, pointer)))
        await unlink(temporary);
    }
    return generation;
  });
}

/** Разрешает только полную проверенную сборку; missing/foreign/corrupt selection не получает fallback. */
export async function readBuiltGeneration(root, id) {
  validateNodeVersion(process.versions.node);
  return bounded(async () => {
    const canonical = await rootDirectory(root),
      manifest = await envelope(canonical);
    let expected;
    if (id === undefined) {
      const pointer = await json(canonical, '.ouro-runtime/last-built.json');
      if (
        pointer.schemaVersion !== 1 ||
        !generationPattern.test(pointer.generation) ||
        !hashPattern.test(pointer.recordSha256)
      )
        throw new ConsumerGenerationError();
      id = pointer.generation;
      expected = pointer.recordSha256;
    }
    if (!generationPattern.test(id)) throw new ConsumerGenerationError();
    const generation = { id, directory: path.join(canonical, '.ouro-runtime', 'generations', id) },
      target = await generationDirectory(canonical, generation),
      content = await bytes(canonical, '.ouro-runtime/records/' + id + '.json', 1024 * 1024);
    if (expected && hash(content) !== expected) throw new ConsumerGenerationError();
    const record = JSON.parse(content.toString('utf8'));
    if (
      record.schemaVersion !== 1 ||
      record.stage !== 'BUILT' ||
      record.generation !== id ||
      record.sourceCommit !== manifest.sourceCommit ||
      record.productVersion !== manifest.productVersion ||
      record.protocolVersion !== manifest.protocolVersion ||
      !hashPattern.test(record.inputDigest)
    )
      throw new ConsumerGenerationError();
    paths(record.artifacts);
    const actual = await artifacts(target);
    if (JSON.stringify(record.artifacts) !== JSON.stringify(actual))
      throw new ConsumerGenerationError();
    return generation;
  });
}
