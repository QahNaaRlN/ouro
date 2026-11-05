import { validateNodeVersion, applicationNodeEngine } from '../runtime-node.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isReleaseVersion } from './release-version.mjs';

const slots = {
  __OURO_PRODUCT_VERSION__: 2,
  __OURO_PROTOCOL_TARBALL__: 2,
  __OURO_PROTOCOL_VERSION__: 1,
  __OURO_PROTOCOL_INTEGRITY__: 1,
};
const canonicalEol = (text) => (typeof text === 'string' ? text.replace(/\r\n/g, '\n') : '');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Отказывает без raw metadata, artifact bytes или package-manager diagnostics. */
export class ConsumerDependencyError extends Error {
  constructor() {
    super('Invalid committed consumer dependency contract.');
    this.name = 'ConsumerDependencyError';
    this.code = 'CONSUMER_DEPENDENCY_INVALID';
  }
}

/** Нормализует только npm bin path prefix; прочие protocol contract поля сохраняет буквально. */
function protocolContract(manifest) {
  return {
    name: manifest.name,
    dependencies: manifest.dependencies,
    bin: Object.fromEntries(
      Object.entries(manifest.bin).map(([name, file]) => [
        name,
        typeof file === 'string' ? file.replace(/^\.\//, '') : file,
      ]),
    ),
    engines: manifest.engines,
    license: manifest.license,
  };
}

/** Материализует один consumer graph, заменяя только конечные release/protocol metadata slots. */
export function materializeConsumerDependencies(options) {
  validateNodeVersion(process.versions.node);
  try {
    const blueprintText = canonicalEol(options.blueprint),
      templateText = canonicalEol(options.template),
      blueprint = JSON.parse(blueprintText),
      lockfile = JSON.parse(templateText),
      provenance = JSON.parse(options.provenance);
    if (
      blueprint.schemaVersion !== 1 ||
      provenance.schemaVersion !== 1 ||
      provenance.templateSha256 !== sha256(templateText) ||
      provenance.blueprintSha256 !== sha256(blueprintText) ||
      !isDeepStrictEqual(provenance.slots, slots) ||
      blueprint.engine !== applicationNodeEngine ||
      !isReleaseVersion(options.productVersion)
    )
      throw new Error();
    const root = lockfile.packages[''],
      protocol = lockfile.packages['node_modules/@ouro/protocol'];
    if (
      lockfile.name !== 'ouro' ||
      lockfile.lockfileVersion !== 3 ||
      lockfile.version !== '__OURO_PRODUCT_VERSION__' ||
      root.name !== 'ouro' ||
      root.version !== '__OURO_PRODUCT_VERSION__' ||
      protocol.version !== '__OURO_PROTOCOL_VERSION__' ||
      protocol.resolved !== 'file:vendor/__OURO_PROTOCOL_TARBALL__' ||
      protocol.integrity !== '__OURO_PROTOCOL_INTEGRITY__'
    )
      throw new Error();
    if (
      !isDeepStrictEqual(root.dependencies, blueprint.dependencies) ||
      !isDeepStrictEqual(root.devDependencies, blueprint.devDependencies) ||
      !isDeepStrictEqual(root.engines, { node: blueprint.engine }) ||
      blueprint.dependencies['@ouro/protocol'] !== 'file:vendor/__OURO_PROTOCOL_TARBALL__'
    )
      throw new Error();
    for (const [token, count] of Object.entries(slots))
      if (templateText.split(token).length - 1 !== count) throw new Error();
    for (const [name, version] of Object.entries({
      ...blueprint.dependencies,
      ...blueprint.devDependencies,
    }))
      if (
        (name !== '@ouro/protocol' && !isReleaseVersion(version)) ||
        name === 'next' ||
        name.startsWith('@next/')
      )
        throw new Error();
    for (const [key, value] of Object.entries(lockfile.packages)) {
      if (!key) continue;
      const name = key.split('node_modules/').at(-1);
      if (
        !key.startsWith('node_modules/') ||
        value.link ||
        name === 'next' ||
        name.startsWith('@next/') ||
        (value.resolved &&
          key !== 'node_modules/@ouro/protocol' &&
          !value.resolved.startsWith('https://registry.npmjs.org/'))
      )
        throw new Error();
    }
    const tupleLines =
      Object.entries(lockfile.packages)
        .filter(([key]) => key && key !== 'node_modules/@ouro/protocol')
        .map(([key, value]) =>
          [key, value.version, value.resolved ?? '', value.integrity ?? ''].join('|'),
        )
        .sort()
        .join('\n') + '\n';
    if (provenance.registryTupleSha256 !== sha256(tupleLines)) throw new Error();
    const manifest = JSON.parse(options.protocol.manifest);
    if (
      !isReleaseVersion(manifest.version) ||
      options.protocol.filename !== `ouro-protocol-${manifest.version}.tgz` ||
      !Buffer.isBuffer(options.protocol.bytes) ||
      options.protocol.bytes.length === 0 ||
      options.protocol.bytes.length > 32 * 1024 * 1024 ||
      !isDeepStrictEqual(protocolContract(manifest), protocolContract(blueprint.protocolContract))
    )
      throw new Error();
    const file = 'file:vendor/' + options.protocol.filename;
    lockfile.version = options.productVersion;
    root.version = options.productVersion;
    root.dependencies['@ouro/protocol'] = file;
    protocol.version = manifest.version;
    protocol.resolved = file;
    protocol.integrity =
      'sha512-' + createHash('sha512').update(options.protocol.bytes).digest('base64');
    if (JSON.stringify(lockfile).includes('__OURO_')) throw new Error();
    return {
      manifest: {
        name: 'ouro',
        version: options.productVersion,
        private: true,
        type: 'module',
        engines: { node: blueprint.engine },
        dependencies: { ...blueprint.dependencies, '@ouro/protocol': file },
        devDependencies: { ...blueprint.devDependencies },
      },
      lockfile,
    };
  } catch {
    throw new ConsumerDependencyError();
  }
}
