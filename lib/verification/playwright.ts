import { createHash } from 'node:crypto';
import { z } from 'zod';
import { verificationImportSchema, type VerificationContract, type VerificationImport, type VerificationRun } from '@ouro/protocol';
const result = z.object({ status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']), errors: z.array(z.object({ message: z.string().optional(), stack: z.string().optional() }).passthrough()).optional() }).passthrough();
const test = z.object({ results: z.array(result).max(20), expectedStatus: z.enum(['passed', 'failed', 'skipped']).optional() }).passthrough();
const spec = z.object({ id: z.string().min(1), title: z.string(), tests: z.array(test).min(1).max(20) }).passthrough();
type Suite = {
    specs?: z.infer<typeof spec>[];
    suites?: Suite[];
};
const suite: z.ZodType<Suite> = z.lazy(() => z.object({ specs: z.array(spec).max(5000).optional(), suites: z.array(suite).max(5000).optional() }).passthrough());
const schema = z.object({ suites: z.array(suite).max(5000), errors: z.array(z.unknown()), stats: z.object({ expected: z.number().int().nonnegative(), unexpected: z.number().int().nonnegative(), flaky: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }).passthrough() }).passthrough();
const invalid = (message: string): never => { throw Object.assign(new Error(message), { code: 'VALIDATION_ERROR' }); };
export type PlaywrightImportProof = {
    report: VerificationImport;
    results: VerificationRun['results'];
    outcome: VerificationRun['outcome'];
    sha256: string;
};
/** Pure ingestion. No process execution, file lookup, URL fetch, or CI attestation. */
export function importPlaywrightReport(input: unknown, contract: VerificationContract): PlaywrightImportProof {
    const parsed = verificationImportSchema.safeParse(input);
    if (!parsed.success)
        return invalid('Некорректные входы прогона.');
    const report = parsed.data;
    let raw: unknown;
    try {
        raw = JSON.parse(report.rawReport);
    }
    catch {
        return invalid('Нужен JSON-отчёт Playwright.');
    }
    // Bound recursion before the recursive schema is used on untrusted JSON.
    const pending: [
        unknown,
        number
    ][] = [[raw, 0]];
    let count = 0;
    while (pending.length) {
        const [value, depth] = pending.pop()!;
        if (depth > 40 || ++count > 30000)
            invalid('Отчёт слишком сложен.');
        if (value && typeof value === 'object')
            for (const child of Object.values(value))
                pending.push([child, depth + 1]);
    }
    const validated = schema.safeParse(raw);
    if (!validated.success)
        return invalid('Отчёт не соответствует Playwright JSON.');
    const data = validated.data, tests = new Map<string, z.infer<typeof spec>>(), suites = [...data.suites];
    while (suites.length) {
        const item = suites.pop()!;
        suites.push(...item.suites ?? []);
        for (const entry of item.specs ?? []) {
            if (tests.has(entry.id))
                invalid('Повтор test ID в отчёте.');
            tests.set(entry.id, entry);
        }
    }
    // Count actual test configurations, not logical cases. Totals cannot disguise omissions.
    const totals = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
    for (const entry of tests.values())
        for (const test of entry.tests) {
            const last = test.results.at(-1), expected = test.expectedStatus ?? 'passed';
            if (!last || last.status === 'skipped')
                totals.skipped++;
            else if (last.status !== expected)
                totals.unexpected++;
            else if (test.results.length > 1 && test.results.slice(0, -1).some(attempt => attempt.status !== expected))
                totals.flaky++;
            else
                totals.expected++;
        }
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
        if (data.stats[key] !== totals[key])
            invalid('Итоги отчёта противоречат результатам тестов.');
    const results: VerificationRun['results'] = report.scopeCaseIds.map(caseId => {
        const item = contract.cases.find(candidate => candidate.id === caseId);
        if (!item)
            invalid('Случай не принадлежит проверочному контракту.');
        if (item!.procedure.kind !== 'playwright')
            return { caseId, outcome: 'not_run', actual: 'Нет исполняемой связи Playwright.' };
        const entry = tests.get(item!.procedure.testId);
        if (!entry)
            return { caseId, outcome: 'not_run', actual: 'Связанный test ID отсутствует в отчёте.' };
        // One test configuration and one attempt in MVP: retry/flaky/multi-project ambiguity is not GREEN.
        if (entry.tests.length !== 1 || entry.tests[0].results.length > 1)
            return { caseId, outcome: 'error', actual: 'Несколько конфигураций или повторов: нужен отдельный однозначный отчёт.' };
        const attempt = entry.tests[0].results[0];
        if (!attempt)
            return { caseId, outcome: 'not_run', actual: 'Нет результата попытки.' };
        if (entry.tests[0].expectedStatus && entry.tests[0].expectedStatus !== 'passed' && attempt.status !== 'skipped')
            return { caseId, outcome: 'error', actual: 'Тест помечен как ожидаемо падающий или пропущенный; нужен обычный проверочный тест без инверсии успеха.' };
        const detail = attempt.errors?.map(error => error.message ?? error.stack ?? 'Ошибка без сообщения').join('\n').slice(0, 7000);
        const outcome = attempt.status === 'timedOut' || attempt.status === 'interrupted' ? 'error' : attempt.status;
        // Expected-failure tests do not prove the product passed the agreed expectation.
        return { caseId, outcome, actual: detail || `${entry.title}: ${attempt.status}` };
    });
    if (data.errors.length)
        for (const item of results) {
            item.outcome = 'error';
            item.actual = 'Ошибка раннера: ' + JSON.stringify(data.errors).slice(0, 7000);
        }
    const outcome = results.some(item => item.outcome === 'error') ? 'error' : results.some(item => item.outcome === 'failed') ? 'failed' : results.some(item => ['skipped', 'not_run'].includes(item.outcome)) ? 'partial' : 'passed';
    return { report, results, outcome, sha256: createHash('sha256').update(report.rawReport, 'utf8').digest('hex') };
}
