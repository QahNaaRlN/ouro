import fs from 'node:fs';
import promises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { syncBuiltinESMExports } from 'node:module';

const [profile, mode, barrierFile] = process.argv.slice(2);
if (!profile || !mode || !barrierFile || !path.isAbsolute(profile) || !path.isAbsolute(barrierFile))
  throw new Error('Explicit fixture paths and mode are required.');
let createdPath = '',
  initializer: DatabaseSync | undefined,
  allowPublish: () => void = () => undefined,
  allowRelease: () => void = () => undefined;
const publish = new Promise<void>((resolve) => {
    allowPublish = resolve;
  }),
  release = new Promise<void>((resolve) => {
    allowRelease = resolve;
  });
process.on('message', (message) => {
  if (message === 'publish') allowPublish();
  if (message === 'release') allowRelease();
});
const send = (value: Record<string, unknown>) => {
  if (process.send) process.send(value);
};

/** Ставит только fixture-барьер; production source не содержит test hooks. */
function barrier(stage: string, extra: Record<string, unknown> = {}) {
  const event = {
    stage,
    pid: process.pid,
    createdPath,
    initializerOpen: initializer?.isOpen,
    ...extra,
  };
  fs.writeFileSync(barrierFile, JSON.stringify(event));
  send(event);
}

const originalOpen = promises.open;
promises.open = async (...args: Parameters<typeof originalOpen>) => {
  const file = String(args[0]),
    temporary = /^\.ouro-[0-9a-f]{20}$/.test(path.basename(file));
  if (mode === 'temp-collision' && args[1] === 'wx' && temporary) {
    if (path.dirname(file) !== path.dirname(profile))
      throw new Error('Refused collision fixture path.');
    fs.writeFileSync(file, 'foreign collision', { flag: 'wx' });
  }
  const handle = await originalOpen(...args);
  if (args[1] === 'wx' && (temporary || file.includes('.ouro-profile-mutex.sqlite')))
    createdPath = file;
  return handle;
};
const originalExec = DatabaseSync.prototype.exec;
const originalPrepare = DatabaseSync.prototype.prepare;
let validationHeld = false;
DatabaseSync.prototype.prepare = function (
  this: DatabaseSync,
  ...args: Parameters<typeof originalPrepare>
) {
  if (
    mode === 'before-validation' &&
    !validationHeld &&
    this !== initializer &&
    args[0] === 'PRAGMA journal_mode'
  ) {
    validationHeld = true;
    barrier('before-validation');
    while (!fs.existsSync(barrierFile + '.continue'))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  return originalPrepare.apply(this, args);
};
DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
  if (sql.includes('CREATE TABLE ouro_profile_mutex')) {
    initializer = this;
    if (mode === 'before-commit') {
      const commit = sql.lastIndexOf('COMMIT;');
      if (commit < 0) throw new Error('Expected fixture initialization transaction.');
      originalExec.call(this, sql.slice(0, commit));
      barrier('before-commit');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      return;
    }
  }
  return originalExec.call(this, sql);
};
const originalLink = promises.link;
if (mode === 'unsupported') {
  promises.rename = async () => {
    send({ stage: 'forbidden-fallback' });
    throw new Error('Publication rename fallback is forbidden.');
  };
  promises.copyFile = async () => {
    send({ stage: 'forbidden-fallback' });
    throw new Error('Publication copy fallback is forbidden.');
  };
}
promises.link = async (...args: Parameters<typeof originalLink>) => {
  const from = String(args[0]),
    to = String(args[1]);
  if (mode === 'before-link') {
    barrier('before-link', { from, to });
    await publish;
  }
  if (mode === 'unsupported')
    throw Object.assign(new Error('Fixture filesystem has no hardlinks.'), { code: 'ENOTSUP' });
  if (mode === 'replace-temp') {
    if (
      path.dirname(from) !== path.dirname(profile) ||
      !/^\.ouro-[0-9a-f]{20}$/.test(path.basename(from))
    )
      throw new Error('Refused fixture path replacement.');
    const replacement = from + '.foreign';
    if (path.dirname(replacement) !== path.dirname(profile))
      throw new Error('Refused foreign fixture replacement path.');
    fs.writeFileSync(replacement, 'foreign replacement', { flag: 'wx' });
    fs.unlinkSync(from);
    fs.renameSync(replacement, from);
    throw Object.assign(new Error('Fixture replacement before unsupported publication.'), {
      code: 'ENOTSUP',
    });
  }
  if (mode === 'foreign-canonical') fs.writeFileSync(to, 'foreign canonical', { flag: 'wx' });
  try {
    await originalLink(...args);
    send({ stage: 'link-result', result: 'linked', from, to });
  } catch (error) {
    send({ stage: 'link-result', result: (error as NodeJS.ErrnoException).code, from, to });
    throw error;
  }
  if (mode === 'after-link') {
    barrier('after-link', { from, to });
    await publish;
  }
};
syncBuiltinESMExports();

try {
  const source = fileURLToPath(
    new URL('../../../../lib/storage/profile-owner.ts', import.meta.url),
  );
  const ownerSource = (await import(
    pathToFileURL(source).href
  )) as typeof import('../../../../lib/storage/profile-owner');
  const owner = await ownerSource.acquireProfileOwner(profile);
  send({ stage: 'acquired', pid: process.pid });
  await release;
  await owner.release();
  send({ stage: 'released' });
  process.disconnect?.();
} catch (error) {
  const failure = error as Error & { code?: string; cause?: Error & { code?: string } };
  send({
    stage: 'rejected',
    message: failure.message,
    code: failure.code,
    cause: failure.cause?.message,
    causeCode: failure.cause?.code,
  });
  process.exitCode = 1;
  process.disconnect?.();
}
