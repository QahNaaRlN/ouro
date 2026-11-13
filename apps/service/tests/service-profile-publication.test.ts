import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  rm,
  rmdir,
  unlink,
  access,
  readFile,
  lstat,
  readdir,
  writeFile,
  mkdir,
  symlink,
  link,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ownerChild } from './profile-publication-fixtures.js';
import { acquireProfileOwner } from '../src/runtime/profile-owner.js';

/** Проверяет фактически committed v1 SQLite metadata без изменения проверяемого файла. */
function validMarker(file: string) {
  const sql = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    assert.equal(sql.prepare('PRAGMA application_id').get()?.application_id, 0x4f55524f);
    assert.equal(sql.prepare('PRAGMA journal_mode').get()?.journal_mode, 'delete');
    assert.deepEqual(
      sql
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((row) => row.name),
      ['ouro_profile_mutex'],
    );
    assert.deepEqual(
      sql
        .prepare('SELECT kind FROM ouro_profile_mutex')
        .all()
        .map((row) => row.kind),
      ['ouro.embedded-profile-mutex/v1'],
    );
  } finally {
    sql.close();
  }
}

/** Ограничивает удаление явно принадлежащей тесту временной папкой. */
async function cleanup(directory: string) {
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
    !path.basename(directory).startsWith('ouro-profile-publication-')
  )
    throw new Error('Refused profile fixture cleanup.');
  await rm(directory, { recursive: true, force: true });
}

/** Отбирает только закрытый private namespace temp-файлов, не выполняя cleanup. */
const temporaryNames = (names: string[]) =>
  names.filter((name) => /^\.ouro-[0-9a-f]{20}$/.test(name));

test('SPP16 canonical SQL validation already holds exclusion against another process', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    first = ownerChild(profile, 'before-validation');
  let second: ReturnType<typeof ownerChild> | undefined,
    restarted: ReturnType<typeof ownerChild> | undefined;
  try {
    assert.equal((await first.waitBarrier()).stage, 'before-validation');
    const canonical = profile + '.ouro-profile-mutex.sqlite',
      bytes = await readFile(canonical);
    second = ownerChild(profile);
    const blocked = await second.waitOutcome();
    assert.equal(
      blocked.stage,
      'rejected',
      'The canonical SQL validation window must already exclude another process.',
    );
    assert.match(blocked.message ?? '', /already owned/);
    await first.continueValidation();
    assert.equal((await first.waitOutcome()).stage, 'acquired');
    await first.close();
    await second.kill();
    restarted = ownerChild(profile);
    assert.equal((await restarted.waitOutcome()).stage, 'acquired');
    await restarted.close();
    assert.deepEqual(await readFile(canonical), bytes);
  } finally {
    await first.kill();
    await second?.kill();
    await restarted?.kill();
    await cleanup(directory);
  }
});

test('SPP01 kill before initial marker COMMIT leaves no ambiguous canonical file and ordinary restart succeeds', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite';
  const first = ownerChild(profile, 'before-commit');
  let restarted: ReturnType<typeof ownerChild> | undefined;
  try {
    const barrier = await first.waitBarrier();
    assert.equal(barrier.stage, 'before-commit');
    assert(barrier.createdPath);
    await first.kill();
    await assert.rejects(
      access(canonical),
      { code: 'ENOENT' },
      'an uncommitted marker must never appear at the canonical path',
    );
    const orphan = await readFile(barrier.createdPath),
      identity = await lstat(barrier.createdPath, { bigint: true });
    restarted = ownerChild(profile);
    assert.equal((await restarted.waitOutcome()).stage, 'acquired');
    await restarted.close();
    assert.deepEqual(await readFile(barrier.createdPath), orphan);
    const after = await lstat(barrier.createdPath, { bigint: true });
    assert.equal(after.ino, identity.ino);
    assert.equal(after.dev, identity.dev);
  } finally {
    await first.kill();
    await restarted?.kill();
    await cleanup(directory);
  }
});

test('SPP02 kill after COMMIT and close but before publication preserves only an untouched orphan and restart succeeds', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    first = ownerChild(profile, 'before-link');
  let restarted: ReturnType<typeof ownerChild> | undefined;
  try {
    const barrier = await first.waitBarrier();
    assert.equal(barrier.stage, 'before-link');
    assert.equal(barrier.initializerOpen, false);
    assert(barrier.from);
    assert(path.basename(barrier.from).length <= '.ouro-profile-mutex.sqlite'.length);
    assert.equal(barrier.to, canonical);
    validMarker(barrier.from);
    await assert.rejects(access(canonical), { code: 'ENOENT' });
    await first.kill();
    const bytes = await readFile(barrier.from),
      identity = await lstat(barrier.from, { bigint: true });
    restarted = ownerChild(profile);
    assert.equal((await restarted.waitOutcome()).stage, 'acquired');
    await restarted.close();
    validMarker(canonical);
    assert.deepEqual(await readFile(barrier.from), bytes);
    const after = await lstat(barrier.from, { bigint: true });
    assert.equal(after.dev, identity.dev);
    assert.equal(after.ino, identity.ino);
  } finally {
    await first.kill();
    await restarted?.kill();
    await cleanup(directory);
  }
});

test('SPP03 two Node initializers publish one inode without overwrite and hold only one exclusive owner', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    first = ownerChild(profile, 'before-link'),
    second = ownerChild(profile, 'before-link');
  let restarted: ReturnType<typeof ownerChild> | undefined;
  try {
    const [left, right] = await Promise.all([first.waitBarrier(), second.waitBarrier()]);
    assert.equal(left.initializerOpen, false);
    assert.equal(right.initializerOpen, false);
    assert(left.from);
    assert(right.from);
    assert.notEqual(left.from, right.from);
    validMarker(left.from);
    validMarker(right.from);
    await assert.rejects(access(canonical), { code: 'ENOENT' });
    const identities = await Promise.all([
      lstat(left.from, { bigint: true }),
      lstat(right.from, { bigint: true }),
    ]);
    first.publish();
    second.publish();
    const outcomes = await Promise.all([first.waitOutcome(), second.waitOutcome()]);
    assert.deepEqual(outcomes.map((result) => result.stage).sort(), ['acquired', 'rejected']);
    assert.match(
      outcomes.find((result) => result.stage === 'rejected')?.message ?? '',
      /already owned/,
    );
    assert.deepEqual(
      [...first.events, ...second.events]
        .filter((event) => event.stage === 'link-result')
        .map((event) => event.result)
        .sort(),
      ['EEXIST', 'linked'],
    );
    const published = await lstat(canonical, { bigint: true });
    assert(
      identities.some(
        (identity) => identity.ino === published.ino && identity.dev === published.dev,
      ),
    );
    await assert.rejects(access(left.from), { code: 'ENOENT' });
    await assert.rejects(access(right.from), { code: 'ENOENT' });
    const winner = outcomes[0].stage === 'acquired' ? first : second,
      loser = winner === first ? second : first;
    await winner.close();
    await loser.kill();
    validMarker(canonical);
    const bytes = await readFile(canonical);
    restarted = ownerChild(profile);
    assert.equal((await restarted.waitOutcome()).stage, 'acquired');
    await restarted.close();
    assert.deepEqual(await readFile(canonical), bytes);
    assert.equal((await lstat(canonical, { bigint: true })).ino, published.ino);
  } finally {
    await first.kill();
    await second.kill();
    await restarted?.kill();
    await cleanup(directory);
  }
});

test('SPP09 the published exclusive owner remains held until real PGlite.close completes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    root = fileURLToPath(new URL('../../../', import.meta.url)),
    requireRoot = createRequire(path.join(root, 'package.json'));
  const { createStore }: typeof import('../../../lib/store') = requireRoot('./lib/store'),
    { PGlite }: typeof import('@electric-sql/pglite') = requireRoot('@electric-sql/pglite');
  const store = await createStore({
      dataDir: profile,
      migrationsDir: path.join(root, 'db/migrations'),
      startObservers: false,
    }),
    original = PGlite.prototype.close;
  let entered: () => void = () => undefined,
    allowClose: () => void = () => undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const closingStarted = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      allowClose = resolve;
    });
  PGlite.prototype.close = async function () {
    entered();
    await gate;
    await original.call(this);
  };
  const stopping = store.close();
  try {
    await Promise.race([
      closingStarted,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('PGlite close barrier deadline')), 5000);
      }),
    ]);
    await assert.rejects(acquireProfileOwner(profile), /already owned/);
    allowClose();
    await stopping;
    const next = await acquireProfileOwner(profile);
    await next.release();
  } finally {
    if (timer) clearTimeout(timer);
    allowClose();
    PGlite.prototype.close = original;
    await stopping;
    await cleanup(directory);
  }
});

test('SPP04 kill after link leaves a valid unchanged canonical marker for ordinary restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    first = ownerChild(profile, 'after-link');
  let restarted: ReturnType<typeof ownerChild> | undefined;
  try {
    const barrier = await first.waitBarrier();
    assert.equal(barrier.stage, 'after-link');
    assert(barrier.from);
    validMarker(canonical);
    await first.kill();
    const bytes = await readFile(canonical),
      identity = await lstat(canonical, { bigint: true });
    restarted = ownerChild(profile);
    assert.equal((await restarted.waitOutcome()).stage, 'acquired');
    await restarted.close();
    assert.deepEqual(await readFile(canonical), bytes);
    assert.equal((await lstat(canonical, { bigint: true })).ino, identity.ino);
    assert.deepEqual(await readFile(barrier.from), bytes);
  } finally {
    await first.kill();
    await restarted?.kill();
    await cleanup(directory);
  }
});

test('SPP05 unsupported hardlink fails closed without copy/rename and cleans only its own temp', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    foreign = canonical + '.init-foreign';
  await writeFile(foreign, 'unrelated orphan');
  const child = ownerChild(profile, 'unsupported');
  try {
    const outcome = await child.waitOutcome();
    assert.equal(outcome.stage, 'rejected');
    assert.equal(outcome.causeCode, 'ENOTSUP');
    assert.equal(
      child.events.some((event) => event.stage === 'forbidden-fallback'),
      false,
    );
    await assert.rejects(access(canonical), { code: 'ENOENT' });
    assert.equal(await readFile(foreign, 'utf8'), 'unrelated orphan');
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.includes('.init-')),
      [path.basename(foreign)],
    );
    assert.deepEqual(temporaryNames(await readdir(directory)), []);
  } finally {
    await child.kill();
    await cleanup(directory);
  }
});

test('SPP06 replacement temp and a foreign competing canonical file are never deleted or overwritten', async () => {
  for (const mode of ['replace-temp', 'foreign-canonical']) {
    const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
      profile = path.join(directory, 'postgres'),
      canonical = profile + '.ouro-profile-mutex.sqlite',
      child = ownerChild(profile, mode);
    try {
      const outcome = await child.waitOutcome();
      assert.equal(outcome.stage, 'rejected');
      if (mode === 'replace-temp') {
        const names = temporaryNames(await readdir(directory));
        assert.equal(names.length, 1);
        assert.equal(await readFile(path.join(directory, names[0]), 'utf8'), 'foreign replacement');
        await assert.rejects(access(canonical), { code: 'ENOENT' });
        assert.match(outcome.cause ?? '', /identity changed/);
      } else {
        assert.equal(await readFile(canonical, 'utf8'), 'foreign canonical');
        assert.deepEqual(temporaryNames(await readdir(directory)), []);
      }
    } finally {
      await child.kill();
      await cleanup(directory);
    }
  }
});

test('SPP07 foreign v1 schema and dataDir/sidecar junction guards preserve foreign bytes and targets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    target = path.join(directory, 'foreign');
  await mkdir(target);
  await mkdir(profile);
  await writeFile(path.join(target, 'sentinel'), 'retained');
  let child: ReturnType<typeof ownerChild> | undefined;
  try {
    const foreign = new DatabaseSync(canonical);
    foreign.exec(
      `PRAGMA journal_mode=DELETE;PRAGMA application_id=${0x4f55524f};CREATE TABLE foreign_data(value TEXT);INSERT INTO foreign_data VALUES('retained');`,
    );
    foreign.close();
    const bytes = await readFile(canonical);
    child = ownerChild(profile);
    assert.equal((await child.waitOutcome()).stage, 'rejected');
    await child.kill();
    assert.deepEqual(await readFile(canonical), bytes);
    await rm(canonical);
    await symlink(
      target,
      canonical + '-journal',
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    child = ownerChild(profile);
    assert.equal((await child.waitOutcome()).stage, 'rejected');
    await child.kill();
    assert.equal(await readFile(path.join(target, 'sentinel'), 'utf8'), 'retained');
    await assert.rejects(access(canonical), { code: 'ENOENT' });
    await rm(canonical + '-journal');
    await rmdir(profile);
    await symlink(target, profile, process.platform === 'win32' ? 'junction' : 'dir');
    child = ownerChild(profile);
    const outcome = await child.waitOutcome();
    assert.equal(outcome.stage, 'rejected');
    assert.match(outcome.message ?? '', /symbolic link/);
    assert.equal(await readFile(path.join(target, 'sentinel'), 'utf8'), 'retained');
    await assert.rejects(access(target + '.ouro-profile-mutex.sqlite'), { code: 'ENOENT' });
  } finally {
    await child?.kill();
    await cleanup(directory);
  }
});

test('SPP08 an existing initialized v1 marker is reused without replacement or a format migration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite';
  await mkdir(profile);
  const legacy = new DatabaseSync(canonical);
  legacy.exec(
    `PRAGMA journal_mode=DELETE;BEGIN EXCLUSIVE;PRAGMA application_id=${0x4f55524f};CREATE TABLE ouro_profile_mutex(kind TEXT NOT NULL);INSERT INTO ouro_profile_mutex(kind) VALUES('ouro.embedded-profile-mutex/v1');COMMIT;`,
  );
  legacy.close();
  const bytes = await readFile(canonical),
    identity = await lstat(canonical, { bigint: true }),
    child = ownerChild(profile);
  try {
    assert.equal((await child.waitOutcome()).stage, 'acquired');
    await child.close();
    validMarker(canonical);
    assert.deepEqual(await readFile(canonical), bytes);
    const after = await lstat(canonical, { bigint: true });
    assert.equal(after.ino, identity.ino);
    assert.equal(after.dev, identity.dev);
    assert.deepEqual(temporaryNames(await readdir(directory)), []);
  } finally {
    await child.kill();
    await cleanup(directory);
  }
});

test('SPP10 supported legacy profile paths keep their SQLite path and filename length budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'p'.repeat(process.platform === 'win32' ? 130 : 200)),
    canonical = profile + '.ouro-profile-mutex.sqlite';
  await mkdir(profile);
  try {
    const legacy = new DatabaseSync(canonical);
    legacy.exec(
      `PRAGMA journal_mode=DELETE;BEGIN EXCLUSIVE;PRAGMA application_id=${0x4f55524f};CREATE TABLE ouro_profile_mutex(kind TEXT NOT NULL);INSERT INTO ouro_profile_mutex(kind) VALUES('ouro.embedded-profile-mutex/v1');COMMIT;`,
    );
    legacy.close();
    const existing = await acquireProfileOwner(profile);
    await existing.release();
    await unlink(canonical);
    const fresh = await acquireProfileOwner(profile);
    await fresh.release();
    validMarker(canonical);
  } finally {
    await cleanup(directory);
  }
});

test('SPP11 a long supported parent with a short profile keeps its previous SQLite path budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    parent = path.join(directory, 'd'.repeat(130)),
    profile = path.join(parent, 'p'),
    canonical = profile + '.ouro-profile-mutex.sqlite';
  await mkdir(profile, { recursive: true });
  try {
    const legacy = new DatabaseSync(canonical);
    legacy.exec(
      `PRAGMA journal_mode=DELETE;BEGIN EXCLUSIVE;PRAGMA application_id=${0x4f55524f};CREATE TABLE ouro_profile_mutex(kind TEXT NOT NULL);INSERT INTO ouro_profile_mutex(kind) VALUES('ouro.embedded-profile-mutex/v1');COMMIT;`,
    );
    legacy.close();
    const existing = await acquireProfileOwner(profile);
    await existing.release();
    await unlink(canonical);
    const fresh = await acquireProfileOwner(profile);
    await fresh.release();
    validMarker(canonical);
  } finally {
    await cleanup(directory);
  }
});

test('SPP12 a wx temp collision fails closed without deleting the preexisting file or publishing canonical', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    canonical = profile + '.ouro-profile-mutex.sqlite',
    child = ownerChild(profile, 'temp-collision');
  try {
    const outcome = await child.waitOutcome();
    assert.equal(outcome.stage, 'rejected');
    assert.equal(outcome.causeCode, 'EEXIST');
    await assert.rejects(access(canonical), { code: 'ENOENT' });
    const files = temporaryNames(await readdir(directory));
    assert.equal(files.length, 1);
    assert.equal(await readFile(path.join(directory, files[0]), 'utf8'), 'foreign collision');
    assert.equal(
      child.events.some((event) => event.stage === 'link-result'),
      false,
    );
  } finally {
    await child.kill();
    await cleanup(directory);
  }
});

test('SPP13 a rejected same-process probe cannot release exclusion against another process', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    owner = await acquireProfileOwner(profile);
  let competitor: ReturnType<typeof ownerChild> | undefined;
  try {
    await assert.rejects(acquireProfileOwner(profile), /already owned/);
    competitor = ownerChild(profile);
    const outcome = await competitor.waitOutcome();
    assert.equal(outcome.stage, 'rejected');
    assert.match(outcome.message ?? '', /already owned/);
  } finally {
    await competitor?.kill();
    await owner.release();
    await cleanup(directory);
  }
});

test('SPP14 a same-process hardlink alias cannot open or release an existing mutex owner', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres'),
    alias = path.join(directory, 'alias'),
    owner = await acquireProfileOwner(profile);
  let competitor: ReturnType<typeof ownerChild> | undefined;
  try {
    await mkdir(alias);
    await link(profile + '.ouro-profile-mutex.sqlite', alias + '.ouro-profile-mutex.sqlite');
    await assert.rejects(acquireProfileOwner(alias), /already owned/);
    await assert.rejects(acquireProfileOwner(profile), /already owned/);
    competitor = ownerChild(profile);
    assert.equal((await competitor.waitOutcome()).stage, 'rejected');
  } finally {
    await competitor?.kill();
    await owner.release();
    await cleanup(directory);
  }
});

test('SPP15 concurrent same-process initializers leave exactly one owner until explicit release', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ouro-profile-publication-')),
    profile = path.join(directory, 'postgres');
  const outcomes = await Promise.allSettled([
      acquireProfileOwner(profile),
      acquireProfileOwner(profile),
    ]),
    owners = outcomes.filter(
      (value): value is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireProfileOwner>>> =>
        value.status === 'fulfilled',
    );
  let competitor: ReturnType<typeof ownerChild> | undefined;
  try {
    assert.equal(owners.length, 1);
    const rejected = outcomes.find((value) => value.status === 'rejected');
    assert(rejected?.status === 'rejected');
    assert.match(String(rejected.reason), /already owned/);
    competitor = ownerChild(profile);
    assert.equal((await competitor.waitOutcome()).stage, 'rejected');
    await owners[0].value.release();
    await owners[0].value.release();
    const reopened = await acquireProfileOwner(profile);
    await reopened.release();
  } finally {
    await competitor?.kill();
    await Promise.all(owners.map((value) => value.value.release()));
    await cleanup(directory);
  }
});
