import { getVerificationReadiness } from './verification';
import type { ProjectState, Spec, SpecRevision, VerificationPhase } from './types';
export const verificationPhaseLabels: Record<VerificationPhase, string> = { preparation: 'Подготовка проверки', implementation: 'Реализация', verification: 'Проверка результата', refactoring:'Рефакторинг', acceptance: 'Предъявление к приёмке' };
export const verificationResultLabels = { not_run: 'Не запускалось', passed: 'Тесты прошли', failed: 'Проверки упали', error: 'Ошибка прогона / стенда', partial: 'Частично проверено' };
export const verificationApplicabilityLabels = { applicable: 'Применимо к выбранному срезу', stale: 'Нужна повторная проверка', incomplete: 'Неполное покрытие', unknown: 'Применимость неизвестна' };
export function getVerificationPresentation(state: ProjectState, revision: SpecRevision) {
    const readiness = getVerificationReadiness(state, revision);
    const review = readiness.run ? state.verificationReviews.findLast(item => item.runId === readiness.run!.id) : undefined;
    const resultLabel = review?.assessment === 'expected_red' ? 'Ожидаемое падение подтверждено' : review?.assessment === 'environment_error' ? 'Ошибка окружения' : review?.assessment === 'invalid_test' ? 'Некорректная проверка' : verificationResultLabels[readiness.result];
    const recorded = state.verificationPhases.findLast(item => item.verificationRevisionId === revision.id);
    const contract = revision.verification;
    const facts = state.events.flatMap(event => {
        if (event.type === 'VerificationPhaseRecorded' && (event.payload.phaseRecord as {
            id?: string;
        })?.id === recorded?.id && recorded)
            return [{ phase: recorded.phase, version: event.version }];
        if (event.type === 'VerificationRunRecorded' && event.specRevisionId === revision.id)
            return [{ phase: 'verification' as const, version: event.version }];
        if (!['ExecutionStarted', 'ExecutionResumed'].includes(event.type))
            return [];
        const execution = state.executions.find(item => item.id === event.executionId && item.kind === 'primary' && item.state === 'running' && !item.stopRequested);
        if (!execution)
            return [];
        if (execution.specRevisionId === revision.id)
            return [{ phase: 'preparation' as const, version: event.version }];
        if (contract && execution.specId === contract.targetSpecId && execution.specRevisionId === contract.targetRevisionId)
            return [{ phase: 'implementation' as const, version: event.version }];
        return [];
    });
    const latest = facts.at(-1), phase = latest?.phase ?? 'preparation';
    return { readiness, resultLabel, applicabilityLabel: verificationApplicabilityLabels[readiness.applicability], phase, phaseVersion: latest?.version ?? 0, phaseLabel: verificationPhaseLabels[phase], foreground: phase === 'implementation'||phase==='refactoring' ? 'work' as const : 'verification' as const, recorded };
}
export type WorkPairGroup = {
    id: string;
    work: Spec;
    verifications: Spec[];
};
/** Binding remains visible after a target revision changes; readiness separately reports stale. */
export function getWorkPairGroups(state: ProjectState): WorkPairGroup[] {
    const groups = new Map(state.specs.filter(spec => !state.revisions.find(item => item.id === spec.revisionIds[0])?.verification).map(work => [work.id, { id: work.id, work, verifications: [] as Spec[] }]));
    const standalone: WorkPairGroup[] = [];
    for (const spec of state.specs) {
        const revision = state.revisions.find(item => item.id === (spec.activeRevisionId ?? spec.revisionIds.at(-1)));
        if (!revision?.verification)
            continue;
        const group = groups.get(revision.verification.targetSpecId);
        if (group)
            group.verifications.push(spec);
        else
            standalone.push({ id: spec.id, work: spec, verifications: [] });
    }
    return [...groups.values(), ...standalone];
}
export function getWorkPairPresentation(state: ProjectState, group: WorkPairGroup) {
    const verifications = group.verifications.map(spec => { const revision = state.revisions.find(item => item.id === (spec.activeRevisionId ?? spec.revisionIds.at(-1)))!; return { spec, revision, ...getVerificationPresentation(state, revision) }; });
    const latest = verifications.toSorted((a, b) => b.phaseVersion - a.phaseVersion)[0];
    const foreground = latest?.foreground === 'verification' ? latest.spec : group.work;
    return { group, verifications, foreground, phaseLabel: latest?.phaseLabel ?? '', summary: verifications.map(item => `${item.spec.humanId}: ${item.resultLabel} · ${item.applicabilityLabel}`).join('; ') };
}
