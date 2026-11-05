import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import prettier from 'prettier';
import { z } from 'zod';
import {
  inspectSourceConventions,
  inspectSourceConventionText,
} from './check-source-conventions.mjs';

const legacyRef = '3f8c986a8a5ddf272afc2ec8c08bc042b369d683';
const positive = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const filename = z
  .string()
  .refine(
    (value) =>
      !/[?*\\:\0]/.test(value) &&
      !path.posix.isAbsolute(value) &&
      path.posix.normalize(value) === value &&
      !value.startsWith('../') &&
      /\.[cm]?[jt]sx?$/.test(value),
  );
const findingSchema = z
  .object({
    tool: z.enum(['source', 'eslint']),
    code: z.string().min(1),
    line: positive,
    column: positive,
    message: z.string().min(1),
  })
  .strict();
const offset = z.number().int().nonnegative();
const proofSchema = z
  .object({
    currentOffset: offset,
    legacyOffset: offset,
    length: positive,
    legacyLine: positive,
    legacyColumn: positive,
    fragmentHash: hash,
  })
  .strict();
const ledgerSchema = z
  .object({
    version: z.literal(1),
    legacyRef: z.literal(legacyRef),
    entries: z.array(
      z
        .object({
          kind: z.enum(['legacy', 'next-link-default-bridge']),
          file: filename,
          contentHash: hash,
          owner: z.string().min(3),
          reason: z.string().min(12),
          disposition: z.enum(['retained-history', 'close-in-c2-c3', 'remove-in-c6']),
          reviewCondition: z.string().min(12),
          formatDebt: z.boolean(),
          origin: z
            .object({ file: filename, blob: z.string().regex(/^[a-f0-9]{40}$/) })
            .strict()
            .optional(),
          findings: z.array(
            z.object({ finding: findingSchema, proof: proofSchema.optional() }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

/** Сравнивает только заранее объявленные поля diagnostics, не скрывая их порядок или текст. */
const findingKey = (value) =>
  JSON.stringify([value.tool, value.code, value.line, value.column, value.message]);
const lines = (text) => text.replaceAll('\r\n', '\n').split('\n');
const fragment = (text, start, length) =>
  text.replaceAll('\r\n', '\n').slice(start, start + length);
const position = (text, line, column) =>
  lines(text)
    .slice(0, line - 1)
    .reduce((sum, value) => sum + value.length + 1, 0) +
  column -
  1;
const occurrences = (text, value) => {
  if (!value) return 0;
  const normalized = text.replaceAll('\r\n', '\n');
  let count = 0,
    index = -1;
  while ((index = normalized.indexOf(value, index + 1)) !== -1) {
    if (++count === 2) return count;
  }
  return count;
};

/** Вычисляет канонический LF fingerprint исходника, не изменяя checkout. */
export function qualitySourceHash(text) {
  return createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
}

/** Сверяет конечный reviewed ledger с текущими и доказанными исходными diagnostics. */
export function auditQualityLedger(reports, ledger, legacyReports) {
  const parsed = ledgerSchema.safeParse(ledger);
  if (!parsed.success) return ['Invalid quality ledger: ' + parsed.error.message];
  const errors = [],
    entries = new Map(),
    originals = new Map(legacyReports.map((report) => [report.file, report]));
  for (const entry of parsed.data.entries) {
    if (entries.has(entry.file)) errors.push('Duplicate quality ledger entry: ' + entry.file);
    entries.set(entry.file, entry);
  }
  for (const report of reports) {
    const entry = entries.get(report.file);
    if (!entry) {
      for (const finding of report.findings)
        errors.push(
          `${report.file}:${finding.line} ${finding.tool}/${finding.code}: ${finding.message}`,
        );
      if (!report.formatted) errors.push(report.file + ': formatter debt is not admitted');
      continue;
    }
    entries.delete(report.file);
    if (entry.contentHash !== qualitySourceHash(report.text))
      errors.push(report.file + ': reviewed source fingerprint changed');
    if (
      JSON.stringify(entry.findings.map((value) => findingKey(value.finding))) !==
      JSON.stringify(report.findings.map(findingKey))
    )
      errors.push(report.file + ': ordered diagnostics changed or became stale');
    if (entry.formatDebt === report.formatted)
      errors.push(report.file + ': formatter disposition changed or became stale');
    if (!entry.findings.length && !entry.formatDebt)
      errors.push(report.file + ': empty stale ledger entry');
    if (entry.kind === 'next-link-default-bridge') {
      if (
        report.file !== 'apps/web/src/app/LegacyNavigationLink.tsx' ||
        entry.origin ||
        entry.formatDebt ||
        entry.disposition !== 'remove-in-c6' ||
        entry.findings.length !== 1 ||
        entry.findings[0].finding.tool !== 'source' ||
        entry.findings[0].finding.code !== 'component-default-export' ||
        entry.findings[0].proof
      )
        errors.push(report.file + ': unsupported technical compatibility exception');
      continue;
    }
    const original = originals.get(entry.origin?.file);
    if (!original || entry.origin.file !== report.file || entry.origin.blob !== original.blob) {
      errors.push(report.file + ': legacy Git origin is missing or changed');
      continue;
    }
    if (entry.disposition === 'remove-in-c6')
      errors.push(report.file + ': legacy debt requires a historical disposition');
    if (entry.formatDebt && original.formatted)
      errors.push(report.file + ': formatter debt did not exist in the legacy source');
    for (const value of entry.findings) {
      const { finding, proof } = value;
      if (!proof) {
        errors.push(report.file + ': missing unchanged-fragment proof');
        continue;
      }
      const current = fragment(report.text, proof.currentOffset, proof.length),
        old = fragment(original.text, proof.legacyOffset, proof.length);
      const originalFinding = original.findings.find(
        (item) =>
          item.tool === finding.tool &&
          item.code === finding.code &&
          item.message === finding.message &&
          item.line === proof.legacyLine &&
          item.column === proof.legacyColumn,
      );
      const currentPosition = position(report.text, finding.line, finding.column),
        oldPosition = position(original.text, proof.legacyLine, proof.legacyColumn);
      if (
        !originalFinding ||
        currentPosition < proof.currentOffset ||
        currentPosition >= proof.currentOffset + proof.length ||
        oldPosition < proof.legacyOffset ||
        oldPosition >= proof.legacyOffset + proof.length ||
        currentPosition - proof.currentOffset !== oldPosition - proof.legacyOffset ||
        current !== old ||
        qualitySourceHash(current) !== proof.fragmentHash ||
        occurrences(report.text, current) !== 1 ||
        occurrences(original.text, old) !== 1
      ) {
        errors.push(
          `${report.file}:${finding.line}: legacy fragment is changed, ambiguous or does not prove this finding`,
        );
      }
    }
  }
  for (const file of entries.keys()) errors.push(file + ': stale or unowned ledger entry');
  return errors;
}

/**
 * Снимает actual AST, ESLint и formatter результаты без исполнения проверяемых модулей.
 * @param root - Абсолютный корень developer workspace.
 * @param sources - Явные immutable Git sources; без них проверяется весь owned source scope.
 * @returns Точные тексты и ordered diagnostics для конечного ledger gate.
 */
export async function collectQualityReports(root, sources) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(root, 'eslint.config.mjs'),
  });
  const files =
    sources ??
    inspectSourceConventions({ root }).files.map((file) => ({
      file,
      text: fs.readFileSync(path.join(root, file), 'utf8'),
    }));
  const reports = [];
  for (const source of files) {
    const absolute = path.join(root, source.file);
    if ((await eslint.isPathIgnored(absolute)) || !(await eslint.calculateConfigForFile(absolute)))
      throw new Error('Owned quality source is ignored or unconfigured: ' + source.file);
    const result = await eslint.lintText(source.text, { filePath: absolute });
    if (result.length !== 1 || result[0].fatalErrorCount)
      throw new Error(
        'Quality parser/setup failed: ' + source.file + ': ' + JSON.stringify(result[0]?.messages),
      );
    const options = await prettier.resolveConfig(path.join(root, source.file));
    if (!options) throw new Error('Quality formatter config was not loaded');
    const findings = [
      ...inspectSourceConventionText(source.file, source.text).map((value) => ({
        tool: 'source',
        code: value.code,
        line: value.line,
        column: value.column,
        message: value.message,
      })),
      ...result[0].messages
        .filter((value) => value.severity === 2)
        .map((value) => ({
          tool: 'eslint',
          code: value.ruleId ?? 'unclassified-eslint-error',
          line: value.line,
          column: value.column,
          message: value.message,
        })),
    ];
    reports.push({
      ...source,
      findings,
      formatted: await prettier.check(source.text, { ...options, filepath: source.file }),
    });
  }
  return reports;
}

/** Читает только фиксированные исходные Git blobs; quality gate не подключается к launch/build. */
export async function collectLegacyQualityReports(root, ledger) {
  const parsed = ledgerSchema.parse(ledger);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
  );
  const readGit = (args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      env: environment,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  readGit(['cat-file', '-e', legacyRef + '^{commit}']);
  const files = [
    ...new Set(
      parsed.entries.filter((entry) => entry.kind === 'legacy').map((entry) => entry.origin?.file),
    ),
  ];
  const sources = files.map((file) => {
    if (!file) throw new Error('Historical quality entry has no origin');
    const specifier = legacyRef + ':' + file;
    const blob = readGit(['rev-parse', specifier]).trim();
    const text = readGit(['cat-file', 'blob', blob]);
    return { file, text, blob };
  });
  return collectQualityReports(root, sources);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd(),
      ledger = JSON.parse(fs.readFileSync(path.join(root, 'source-quality-debt.json'), 'utf8'));
    const reports = await collectQualityReports(root),
      legacy = await collectLegacyQualityReports(root, ledger),
      errors = auditQualityLedger(reports, ledger, legacy);
    for (const file of [
      '.prettierrc.json',
      'tests/fixtures/source-quality/cases.json',
      'source-quality-debt.json',
      'apps/web/tests/fixtures/session-hook-probe.html',
    ]) {
      const options = await prettier.resolveConfig(path.join(root, file));
      if (
        !options ||
        !(await prettier.check(fs.readFileSync(path.join(root, file), 'utf8'), {
          ...options,
          filepath: file,
        }))
      )
        errors.push(file + ': quality-owned configuration/fixture formatting failed');
    }
    for (const error of errors) console.error(error);
    console.log(
      JSON.stringify({
        files: reports.length,
        findings: reports.reduce((count, report) => count + report.findings.length, 0),
        formatterDebt: reports.filter((report) => !report.formatted).length,
        reviewedEntries: ledger.entries.length,
        errors: errors.length,
      }),
    );
    process.exitCode = errors.length ? 1 : 0;
  } catch (error) {
    console.error('Quality setup failed:', error);
    process.exitCode = 1;
  }
}
