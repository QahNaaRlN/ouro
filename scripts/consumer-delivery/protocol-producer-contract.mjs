import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isReleaseVersion } from './release-version.mjs';

const canonicalEol = (text) => text.replace(/\r\n/g, '\n');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalarText = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value);
/** Конечные Windows-алиасы сегмента совпадают с существующим source path audit. */
const unsafeSegment = (part) =>
  !part ||
  part === '.' ||
  part === '..' ||
  /[. ]$/.test(part) ||
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part);
const packageName = (value) =>
  scalarText(value) &&
  value.length <= 214 &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) &&
  !value.split('/').some(unsafeSegment);
const registryRange = (value) =>
  scalarText(value) && value.length <= 200 && /^[0-9A-Za-z^~<>=*|+. -]+$/.test(value);
const optionalFlags = [
  'dev',
  'devOptional',
  'optional',
  'inBundle',
  'hasInstallScript',
  'hasShrinkwrap',
];
const metadataFields = [
  'schemaVersion',
  'manifestSha256',
  'lockfileSha256',
  'registryTupleSha256',
  'registryPackageEntries',
];

/** Не раскрывает input bytes, parser diagnostics или адреса из недопустимого контракта. */
export class ProtocolProducerDependencyError extends Error {
  constructor() {
    super('Invalid committed protocol producer dependency contract.');
    this.name = 'ProtocolProducerDependencyError';
    this.code = 'PROTOCOL_PRODUCER_DEPENDENCY_INVALID';
  }
}

/** Проверяет registry declarations без запуска resolver или преобразования выбранных версий. */
function dependencyMap(value) {
  return (
    record(value) &&
    Object.entries(value).every(([name, range]) => packageName(name) && registryRange(range))
  );
}

/** Сохраняет один относительный bin path; нормализует только разрешённый npm префикс. */
function binMap(value) {
  if (!record(value) || Object.keys(value).length === 0) throw Error();
  return Object.fromEntries(
    Object.entries(value).map(([name, file]) => {
      if (
        !scalarText(name) ||
        !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
        unsafeSegment(name) ||
        !scalarText(file)
      )
        throw Error();
      const normalized = file.replace(/^\.\//, '');
      if (
        normalized.includes('\\') ||
        normalized.includes(':') ||
        normalized.split('/').some(unsafeSegment)
      )
        throw Error();
      return [name, normalized];
    }),
  );
}

/** Проверяет абсолютный canonical npm tarball URL и единственный полный sha512 digest. */
function registryTuple(entry, name) {
  if (
    !record(entry) ||
    Object.hasOwn(entry, 'link') ||
    !isReleaseVersion(entry.version) ||
    !scalarText(entry.resolved) ||
    typeof entry.integrity !== 'string'
  )
    throw Error();
  const url = new URL(entry.resolved);
  if (
    url.href !== entry.resolved ||
    url.origin !== 'https://registry.npmjs.org' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' + name + '/-/' + name.split('/').at(-1) + '-' + entry.version + '.tgz'
  )
    throw Error();
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)) throw Error();
  const digest = entry.integrity.slice(7),
    bytes = Buffer.from(digest, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== digest) throw Error();
  for (const flag of optionalFlags)
    if (Object.hasOwn(entry, flag) && typeof entry[flag] !== 'boolean') throw Error();
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ])
    if (Object.hasOwn(entry, field) && !dependencyMap(entry[field])) throw Error();
}

/** Материализует только проверенный npm lock для canonical protocol manifest; FS и процессы принадлежат вызывающему owner. */
export function materializeProtocolProducerDependencies(options) {
  try {
    if (
      !record(options) ||
      !['manifest', 'lockfile', 'metadata'].every(
        (field) =>
          typeof options[field] === 'string' &&
          options[field].length > 0 &&
          Buffer.byteLength(options[field], 'utf8') <= 32 * 1024 * 1024,
      )
    )
      throw Error();
    const manifestText = canonicalEol(options.manifest),
      lockfileText = canonicalEol(options.lockfile),
      manifest = JSON.parse(manifestText),
      lockfile = JSON.parse(lockfileText),
      metadata = JSON.parse(options.metadata);
    if (
      !record(metadata) ||
      !isDeepStrictEqual(Object.keys(metadata).sort(), [...metadataFields].sort()) ||
      metadata.schemaVersion !== 1 ||
      !Number.isSafeInteger(metadata.registryPackageEntries) ||
      metadata.registryPackageEntries < 0
    )
      throw Error();
    for (const field of ['manifestSha256', 'lockfileSha256', 'registryTupleSha256'])
      if (typeof metadata[field] !== 'string' || !/^[a-f0-9]{64}$/.test(metadata[field]))
        throw Error();
    if (
      metadata.manifestSha256 !== sha256(manifestText) ||
      metadata.lockfileSha256 !== sha256(lockfileText)
    )
      throw Error();
    if (
      !record(manifest) ||
      manifest.name !== '@ouro/protocol' ||
      !isReleaseVersion(manifest.version) ||
      !dependencyMap(manifest.dependencies) ||
      !dependencyMap(manifest.devDependencies) ||
      !record(manifest.engines) ||
      !Object.hasOwn(manifest.engines, 'node') ||
      !Object.entries(manifest.engines).every(
        ([name, value]) => scalarText(name) && registryRange(value),
      ) ||
      !scalarText(manifest.license)
    )
      throw Error();
    if (
      !record(lockfile) ||
      lockfile.name !== manifest.name ||
      lockfile.version !== manifest.version ||
      lockfile.lockfileVersion !== 3 ||
      lockfile.requires !== true ||
      !record(lockfile.packages) ||
      !Object.hasOwn(lockfile.packages, '')
    )
      throw Error();
    const root = lockfile.packages[''];
    if (
      !record(root) ||
      root.name !== manifest.name ||
      root.version !== manifest.version ||
      Object.hasOwn(root, 'link') ||
      Object.hasOwn(root, 'resolved') ||
      Object.hasOwn(root, 'integrity') ||
      root.license !== manifest.license ||
      !isDeepStrictEqual(root.dependencies, manifest.dependencies) ||
      !isDeepStrictEqual(root.devDependencies, manifest.devDependencies) ||
      !isDeepStrictEqual(root.engines, manifest.engines) ||
      !isDeepStrictEqual(binMap(root.bin), binMap(manifest.bin))
    )
      throw Error();
    for (const field of ['optionalDependencies', 'peerDependencies'])
      if (
        (Object.hasOwn(manifest, field) && !dependencyMap(manifest[field])) ||
        !isDeepStrictEqual(root[field], manifest[field])
      )
        throw Error();
    for (const name of [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ])
      if (!Object.hasOwn(lockfile.packages, 'node_modules/' + name)) throw Error();
    const entries = Object.entries(lockfile.packages).filter(([key]) => key);
    for (const [key, entry] of entries) {
      if (
        !key.startsWith('node_modules/') ||
        !key.slice(13).split('/node_modules/').every(packageName)
      )
        throw Error();
      registryTuple(entry, key.slice(13).split('/node_modules/').at(-1));
    }
    const tuples =
      entries
        .map(([key, value]) => [key, value.version, value.resolved, value.integrity].join('|'))
        .sort()
        .join('\n') + '\n';
    if (
      metadata.registryPackageEntries !== entries.length ||
      metadata.registryTupleSha256 !== sha256(tuples)
    )
      throw Error();
    return { lockfile: lockfileText };
  } catch {
    throw new ProtocolProducerDependencyError();
  }
}
