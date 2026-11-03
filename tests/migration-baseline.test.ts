import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/check-migration-baseline.mjs');

/** Утилита, которая проверяет настоящий CLI на изолированных исходниках маршрутов. */
function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8', timeout: 15_000 });
}

/** Утилита, которая создаёт изолированный пример с управляемым исходным контрактом. */
async function fixture(source = 'export async function GET() { return Response.json({ value: 1 }); }') {
  const root = await mkdtemp(path.join(tmpdir(), 'ouro-route-contract-'));
  const route = path.join(root, 'app/api/sample/route.ts');
  const baseline = path.join(root, 'baseline.json');
  await mkdir(path.dirname(route), { recursive: true });
  await writeFile(route, source);
  const result = run(root, '--print');
  assert.equal(result.status, 0, result.stderr);
  const document = { contract: 'ouro-http-baseline/v1', routes: JSON.parse(result.stdout) };
  await writeFile(baseline, JSON.stringify(document));
  return { root, route, baseline, document, close: () => rm(root, { recursive: true, force: true }) };
}

test('RVF03 inventories declarations and preserves Next implicit methods without executing handlers', async () => {
  const f = await fixture("throw new Error('must not execute'); export const GET = () => new Response(); export function POST() {} export { handler as DELETE }; const handler = () => {}; export type { HEAD } from './types';");
  try {
    assert.deepEqual(f.document.routes[0].methods, ['DELETE', 'GET', 'POST']);
    assert.equal(f.document.routes[0].path, '/api/sample');
    assert.deepEqual(f.document.routes[0].implicit, { head: 'GET', options: { kind: 'automatic', status: 204, allow: 'DELETE, GET, HEAD, OPTIONS, POST' }, unsupported: { status: 405, allowHeader: false } });
    const check = run(f.root, '--baseline', f.baseline); assert.equal(check.status, 0, check.stderr);
  } finally { await f.close(); }
});

test('RVF03 rejects a changed method or handler even when its URL stays the same', async () => {
  const f = await fixture();
  try {
    await writeFile(f.route, 'export async function POST() { return Response.json({ value: 2 }); }');
    const result = run(f.root, '--baseline', f.baseline);
    assert.notEqual(result.status, 0, 'changed HTTP contract must require reviewed baseline update');
    assert.match(result.stderr, /app\/api\/sample\/route\.ts/);
    await writeFile(f.route, 'export async function GET() { return Response.json({ value: 2 }); }');
    assert.notEqual(run(f.root, '--baseline', f.baseline).status, 0, 'handler changes with the same methods must be reviewed');
  } finally { await f.close(); }
});

test('RVF03 source fingerprints tolerate Git newline conversion across Windows and Linux', async () => {
  const source = 'export async function GET() {\n  return Response.json({ value: 1 });\n}\n';
  const f = await fixture(source);
  try {
    await writeFile(f.route, source.replaceAll('\n', '\r\n'));
    const result = run(f.root, '--baseline', f.baseline); assert.equal(result.status, 0, result.stderr);
  } finally { await f.close(); }
});

test('RVF03 rejects added and removed routes instead of silently accepting a partial inventory', async () => {
  const f = await fixture();
  try {
    const added = path.join(f.root, 'app/api/new/route.ts'); await mkdir(path.dirname(added), { recursive: true }); await writeFile(added, 'export const POST = () => new Response();');
    assert.notEqual(run(f.root, '--baseline', f.baseline).status, 0, 'new route must be reviewed');
    await rm(path.dirname(added), { recursive: true }); await rm(f.route);
    assert.notEqual(run(f.root, '--baseline', f.baseline).status, 0, 'missing route must be reviewed');
  } finally { await f.close(); }
});

test('RVF03 rejects duplicate baseline paths and corrupted implicit method policy', async () => {
  const f = await fixture();
  try {
    const document = JSON.parse(await readFile(f.baseline, 'utf8'));
    document.routes.push({ ...document.routes[0] }); await writeFile(f.baseline, JSON.stringify(document));
    assert.notEqual(run(f.root, '--baseline', f.baseline).status, 0, 'duplicates cannot conceal missing coverage');
    document.routes.pop(); document.routes[0].implicit.options.allow = 'POST'; await writeFile(f.baseline, JSON.stringify(document));
    assert.notEqual(run(f.root, '--baseline', f.baseline).status, 0, 'implicit method behavior is part of the baseline');
  } finally { await f.close(); }
});
