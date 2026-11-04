import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inventoryStyles, inspectStyles, type StyleLedger } from '../scripts/check-ui-styles.mjs';

/** Создаёт изолированный styling fixture без загрузки приложения. */
async function fixture(entries: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'ouro-style-gate-'));
  for (const [file, text] of Object.entries(entries)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
  const inventory = inventoryStyles(root);
  const ledger: StyleLedger = { contract: 'ouro-style-debt/v1', technicalCss: {}, css: inventory.css.map(record => ({ ...record, owner: 'fixture-family' })), inline: inventory.inline.map(record => ({ ...record, owner: 'fixture-family' })) };
  return { root, ledger, write: async (file: string, text: string) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }, close: async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('ouro-style-gate-')) throw new Error('Refused cleanup outside the owned fixture.');
    await rm(root, { recursive: true, force: true });
  } };
}

test('SMG01 inventories modules, JSX, graph styles and imperative writes without executing source', async () => {
  const f = await fixture({ 'app/view.module.css': '.panel {color:red}', 'components/view.tsx': "throw Error('never execute'); const node={style:{width:210},labelStyle:{fill:'red'}}; const view=<div style={{color:'blue'}}/>; element.style.height='10px';" });
  try {
    const actual = inventoryStyles(f.root);
    assert.equal(actual.css.length, 1); assert.equal(actual.inline.length, 1);
    assert.deepEqual(actual.inline[0].expressions.map(value => value.kind).sort(), ['dom', 'graph', 'graph', 'jsx']);
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
  } finally { await f.close(); }
});

test('SMG02 rejects new CSS and inline declarations outside the exact owned ledger', async () => {
  const f = await fixture({});
  try {
    await f.write('components/new.module.css', '.panel {color:red}');
    await f.write('components/view.tsx', 'export const View=()=> <div style={{color:"red"}}/>;');
    const issues = inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n');
    assert.match(issues, /new\.module\.css/); assert.match(issues, /view\.tsx/);
  } finally { await f.close(); }
});

test('SMG02 rejects changed and stale styling debt, including referenced same-file constants', async () => {
  const f = await fixture({ 'app/old.css': '.old {color:red}', 'components/view.tsx': 'const recipe={color:"red"}; export const View=()=> <div style={recipe}/>;' });
  try {
    await f.write('components/view.tsx', 'const recipe={color:"blue"}; export const View=()=> <div style={recipe}/>;');
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /view\.tsx/);
    await rm(path.join(f.root, 'app/old.css'));
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /stale.*old\.css/i);
  } finally { await f.close(); }
});

test('SMG03 does not permit component styling under a technical theme/base label or @apply', async () => {
  const f = await fixture({ 'app/theme.css': '.panel {padding:20px}', 'app/old.css': '.old {@apply flex px-4}' });
  try {
    f.ledger.technicalCss['app/theme.css'] = { kind: 'base-theme', reason: 'Fixture base palette' };
    f.ledger.css = f.ledger.css.filter(value => value.file !== 'app/theme.css');
    const issues = inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n');
    assert.match(issues, /technical.*theme\.css/i); assert.match(issues, /@apply/);
  } finally { await f.close(); }
});

test('SMG03 accepts only minimal base and Tailwind directives as technical residue', async () => {
  const f = await fixture({ 'app/theme.css': ':root {--bg:#fff;color-scheme:light} html,body {margin:0;color:var(--text);font-size:14px}', 'app/tailwind.css': '@layer theme,base,utilities; @import "tailwindcss/theme.css" layer(theme); @source "../components"; @theme inline {--color-ouro-bg:var(--bg)}' });
  try {
    f.ledger.css = [];
    f.ledger.technicalCss = { 'app/theme.css': { kind: 'base-theme', reason: 'Document defaults' }, 'app/tailwind.css': { kind: 'tailwind', reason: 'Tailwind entry' } };
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.length, 0);
    await f.write('app/theme.css', 'body {padding:24px}');
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /technical/);
  } finally { await f.close(); }
});

test('SMG04 final mode refuses known ordinary styles and any transitional legacy layer', async () => {
  const f = await fixture({ 'app/old.css': '.old {color:red}', 'app/tailwind.css': '@layer theme,ouro-legacy,utilities;' });
  try {
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
    const issues = inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.join('\n');
    assert.match(issues, /unfinished|ordinary/i); assert.match(issues, /legacy/i);
  } finally { await f.close(); }
});

test('SMG02 exact dynamic-route paths are records, while wildcard policies cannot hide additions', async () => {
  const f = await fixture({ 'app/projects/[projectId]/old.css': '.old {color:red}' });
  try {
    assert.equal(inspectStyles({ root: f.root, ledger: f.ledger }).violations.length, 0);
    f.ledger.css[0].file = 'app/projects/*/old.css';
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger }).violations.join('\n'), /Invalid|Unowned/);
  } finally { await f.close(); }
});

test('SMG01 unverified source junctions cannot make final mode silently miss external CSS', async () => {
  const f = await fixture({}), external = await mkdtemp(path.join(tmpdir(), 'ouro-style-external-'));
  const link = path.join(f.root, 'app/linked');
  let linked = false;
  try {
    await writeFile(path.join(external, 'ordinary.css'), '.panel {color:red}');
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(external, link, 'junction'); linked = true;
    assert.throws(() => inspectStyles({ root: f.root, ledger: f.ledger, final: true }), /symbolic|junction/i);
  } finally {
    if (linked) await unlink(link);
    await f.close();
    if (path.dirname(path.resolve(external)) !== path.resolve(tmpdir()) || !path.basename(external).startsWith('ouro-style-external-')) throw new Error('Refused cleanup outside the owned external fixture.');
    await rm(external, { recursive: true, force: true });
  }
});

for (const [name, source] of [
  ['shorthand JSX spread', 'const style={color:"red"}; const View=()=> <div {...{style}}/>;'],
  ['literal computed style access', 'element["style"].color="red";'],
  ['Object.assign style target', 'Object.assign(element.style,{color:"red"});'],
  ['direct style assignment', 'element.style="color:red";'],
  ['namespaced style attribute', 'element.setAttributeNS(null,"style","color:red");'],
] as const) test('SMG01 detects ' + name + ' without general dataflow analysis', async () => {
  const f = await fixture({});
  try {
    await f.write('components/view.tsx', source);
    assert.match(inspectStyles({ root: f.root, ledger: f.ledger, final: true }).violations.join('\n'), /inline styling/);
  } finally { await f.close(); }
});
