import {
  MeridianContextError,
  validWorkScopeView,
  type WorkScopeView,
} from '../../meridian/src/context';
import type { RevisionContent } from './types';

const invalid = (message?: string): never => {
  throw new MeridianContextError(message);
};

/**
 * Утилита, которая создаёт ожидание черновика из закреплённого контекста Meridian.
 * @param view - Проверенный закрытый work-scope v1 без полномочий запуска.
 * @returns Содержание черновика с сохранённым происхождением и критериями проверки.
 * @throws {MeridianContextError} При неверном контексте или превышении ограничений черновика.
 * @example
 * mapMeridianExpectation(scope)
 */
export function mapMeridianExpectation(view: WorkScopeView): RevisionContent {
  if (!validWorkScopeView(view)) invalid();
  const f = view.facts;
  const content: RevisionContent = {
    title: `Meridian · ${f.subject_ref.record_key.id}`,
    goal: f.goal.goal,
    dod: f.goal.acceptance_criteria.map((c) => ({
      id: `meridian:${c.id}`,
      text: `${c.statement}\nПроверка: ${c.verification.method}\nОжидаемый результат: ${c.verification.expected_result}`,
      required: true,
    })),
    constraints: f.goal.constraints.join('\n'),
    assumptions: 'Подлинность импортированного документа независимо не проверена.',
    risks: [
      ...f.resolution.conflicts.map((c) => c.reason),
      ...f.resolution.unresolved_items.map((u) => u.reason),
      ...f.resolution.unresolved_applicability.map((u) => u.reason),
      ...(f.resolution.requires_reresolution
        ? ['Источник требует повторного определения применимости.']
        : []),
      ...(f.resolution.decomposition_required ? ['Источник требует декомпозиции.'] : []),
    ].join('\n'),
    inputs: [
      `Проект: ${f.project_id}; репозиторий: ${f.repository_id}; workspace: ${f.subject_ref.workspace_id}`,
      `Run: ${f.run_ref.run.key.id} @${f.run_ref.run.revision}`,
      `Исходное состояние: ${f.goal.initial_state}`,
      `Целевая модель: ${f.goal.target_model}`,
      ...f.authoritative_sources.map(
        (s) => `Источник ${s.id}: ${s.reference} — ${s.purpose} [${s.resolution}]`,
      ),
      ...f.applicable_norms.map(
        (n) => `Норма ${n.id}: ${n.reference} — ${n.applicability_rationale} [${n.resolution}]`,
      ),
      ...f.decisions.map((d) => `Решение ${d.id}: ${d.text}`),
      `Объявленные пути (данные): ${f.declared_scope.declared_paths.join(', ')}`,
      ...f.resolution.required_verification.map(
        (v) => `Заявленная проверка (не выполнялась): ${v}`,
      ),
    ].join('\n'),
    comment: 'Черновик из импортированного Meridian work-scope v1; активация отдельно.',
  };
  if (!content.dod.length)
    invalid(
      'Документ корректен, но не содержит критериев приёмки для черновика спеки. Подготовьте контекст с DoD.',
    );
  if (
    content.dod.length > 50 ||
    new Set(content.dod.map((c) => c.id)).size !== content.dod.length ||
    Object.values(content).some((v) => typeof v === 'string' && v.length > 20000) ||
    content.dod.some((c) => c.text.length > 20000)
  )
    invalid(
      'Документ корректен, но автоматическое ожидание превышает ограничения спеки. Сначала подготовьте меньший контекст.',
    );
  return content;
}
