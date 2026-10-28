import { AGENT_ID, applyCommand, emptyState, PROJECT_ID } from './engine';
import type { Actor, Command, DomainEvent, RevisionContent } from './types';

export const HUMAN_ID = '524b6fa2-54dd-42bb-b870-a4b231266001';
/** Deterministic, repeatable fixtures: all transitions go through the same guards as real commands. */
export function createSeedEvents(): DomainEvent[] {
  let state = emptyState();
  let sequence = 0;
  const nextId = () => `1b2a0000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const human: Actor = { id: HUMAN_ID, kind: 'human', projectIds: [PROJECT_ID], name: 'Камиль' };
  const agent: Actor = { id: AGENT_ID, kind: 'agent', projectIds: [PROJECT_ID], name: 'Ouro · симулятор' };
  let clock = 0;
  const run = (data: Record<string, unknown>, actor = human) => {
    const command = { ...data, expectedVersion: state.version, requestId: nextId() } as Command;
    state = applyCommand(state, command, actor, { id: nextId, now: new Date(Date.UTC(2026, 9, 28, 9, 0, clock++ * 40)).toISOString() }).state;
  };
  const content = (title: string, goal: string, criteria: string[]): RevisionContent => ({
    title, goal, dod: criteria.map((text, index) => ({ id: `criterion-${index + 1}`, text, required: true })),
    inputs: 'ТЗ Ouro 1.1.0-draft.1 · ТС Ouro · подтверждённые требования человека',
    constraints: 'Решение человека обязательно. Успех агента не заменяет приёмку DoD.',
    assumptions: 'Подготовленный локальный проект и симулятор агента; реальный агент ещё не подключён.',
    risks: 'Потеря связи не должна восприниматься как успех или подтверждённая остановка.',
    comment: 'Демонстрационные данные. Записи создаются через доменные команды и сохраняются в истории.',
  });
  const definitions = [
    content('Спроектировать ядро состояний', 'Разделить ожидание, выполнение и решение человека в независимые статусные модели.', ['Action сохраняется без одобрения', 'Question, Fork и Blocker требуют решения человека']),
    content('Построить дорожную карту', 'Показывать цели, обязательные зависимости и точки внимания без потери контекста.', ['Цикл зависимости отклоняется с путём ошибки', 'Граф и таблица показывают одни и те же данные']),
    content('Сохранить неизменяемую историю', 'Восстанавливать текущее состояние из фактов и сохранять основания решений.', ['Новая ревизия сохраняет прежнюю историю', 'Повтор команды не создаёт второй факт']),
    content('Подключить Execution Inbox', 'Принимать факты агента и направлять вопросы и препятствия человеку.', ['Сообщения проверяются по типу и scope', 'Одобрение плана не снимает технический блокер']),
    content('Подготовить интеграцию Meridian', 'Сохранить самостоятельный домен Ouro и согласовать визуальный язык Meridian.', ['Inter и JetBrains Mono используются по назначению', 'Контракты идентичности не предполагаются существующими']),
    content('Выпустить первый прототип', 'Предъявить проверяемый сквозной сценарий от постановки до человеческой приёмки.', ['Решение и подтверждение применения видны отдельно', 'Экспорт истории воспроизводит то же состояние']),
  ];
  for (const c of definitions) { run({ type: 'createSpec', content: c }); const spec = state.specs.at(-1)!; run({ type: 'activateRevision', specId: spec.id, revisionId: spec.revisionIds[0] }); }
  const [core, roadmap, history, inbox, meridian, release] = state.specs;
  const start = (specId: string) => {
    const spec = state.specs.find(s => s.id === specId)!;
    run({ type: 'startExecution', specId, specRevisionId: spec.activeRevisionId, agentId: AGENT_ID });
    const execution = state.executions.at(-1)!; run({ type: 'confirmResumed', executionId: execution.id }, agent); return execution;
  };
  const coreExecution = start(core.id);
  run({ type: 'reportAction', specId: core.id, specRevisionId: core.activeRevisionId, executionId: coreExecution.id, title: 'Разделены три оси состояния', context: 'Доменная модель проверена на сценарии вопрос → ответ → подтверждение применения.', actionId: nextId(), phase: 'completed', evidence: 'simulation://checks/domain-statuses · локальный демонстрационный результат' }, agent);
  run({ type: 'completeExecution', executionId: coreExecution.id, result: 'succeeded', evidence: 'simulation://checks/core-invariants · 2 проверенных критерия' }, agent);
  run({ type: 'acceptSpec', specId: core.id, specRevisionId: core.activeRevisionId, evidence: { 'criterion-1': 'Человек проверил отдельную фиксацию Action в демонстрационном сценарии.', 'criterion-2': 'Человек подтвердил обязательное участие в Question, Fork и Blocker.' } });
  for (const spec of [roadmap, history, inbox, meridian]) run({ type: 'addDependency', from: core.id, to: spec.id });
  for (const spec of [roadmap, history, inbox, meridian]) run({ type: 'addDependency', from: spec.id, to: release.id });
  const roadExecution = start(roadmap.id);
  run({ type: 'reportFork', specId: roadmap.id, specRevisionId: roadmap.activeRevisionId, executionId: roadExecution.id, title: 'Как расположить зависимости на карте?', context: 'Для первого прототипа нужны устойчивые позиции шести спецификаций и понятное направление A → B: B требует A.', reason: 'Автоматическая перестройка после каждого события смещает выбранную спецификацию и мешает человеку сопоставлять ожидание с текущей реальностью.', options: [{ id: 'stable-layout', title: 'Устойчивые позиции', description: 'Сохранять расположение узлов; перестраивать карту только по явной команде человека.' }, { id: 'automatic-layout', title: 'Перестраивать при изменениях', description: 'Каждое добавление зависимости запускает новый layout; структура компактнее, положение узлов меняется.' }], recommendationOptionId: 'stable-layout' }, agent);
  const historyExecution = start(history.id);
  run({ type: 'reportAction', specId: history.id, specRevisionId: history.activeRevisionId, executionId: historyExecution.id, title: 'Подготовлено воспроизведение событий', context: 'Проекция состояния вычисляется из последовательности неизменяемых фактов.', actionId: nextId(), phase: 'completed', evidence: 'simulation://checks/replay · пример восстановленного состояния' }, agent);
  run({ type: 'reportQuestion', specId: history.id, specRevisionId: history.activeRevisionId, executionId: historyExecution.id, title: 'Как назвать экспорт истории?', context: 'Вопрос не блокирует независимую работу над журналом. Название экспорта остаётся решением человека.', question: 'Оставить название «История решений» или использовать «Журнал реальности»?', blockingScope: 'none' }, agent);
  const inboxExecution = start(inbox.id);
  run({ type: 'reportBlocker', specId: inbox.id, specRevisionId: inbox.activeRevisionId, executionId: inboxExecution.id, title: 'Не подтверждён контекст агента', context: 'Симулятор обнаружил сообщение без проверенной привязки к разрешённому проекту.', expected: 'Каждый отчёт имеет серверный scope проекта и проверенную идентичность исполнителя.', actual: 'В тестовом внешнем сообщении отсутствует подтверждённый project scope.', reason: 'Без проверенного сервером контекста один агент может записать сведения в чужой проект, поэтому обработка такого сообщения должна быть остановлена.', impact: 'Публикация внешних сообщений остановлена; локальная работа над интерфейсом может продолжаться.', options: [{ id: 'scope-check', title: 'Проверять scope на сервере', description: 'Добавить ограниченную попытку устранения: проверить полномочия и отклонить чужой projectId.' }] }, agent);
  return state.events;
}
