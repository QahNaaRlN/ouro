import { test, expect, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ProjectState } from '../packages/core/src';
import { chooseSelectOption, selectPopup } from './select-helpers';

type Case = { specId: string; requestId?: string; executionId: string };
type Fixture = { state: ProjectState; cases: Record<string, Case> };
const content = (title: string) => ({
  title,
  goal: 'Сохранить различие решения, разрешения и физической остановки.\nИстория остаётся источником фактов.',
  dod: [{ id: 'view', text: 'История и полномочия сохранены.', required: true }],
  constraints: 'Только собственный профиль проверки оформления.',
  assumptions: 'Существующие факты не переписываются.',
  risks: 'Потеря связи не подтверждает физическую остановку.',
  inputs: 'test://tailwind-methodology/owned-profile',
  comment: '',
});

/** Записывает собственные конечные состояния один раз; все comparative runs после этого только читают. */
async function methodologyFixture(page: Page, baseURL: string): Promise<Fixture> {
  const manifest = join(resolve(process.env.OURO_E2E_DATA_DIR!), 'methodology-visual-fixture.json');
  try {
    return JSON.parse(await readFile(manifest, 'utf8')) as Fixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const snapshot = async (): Promise<ProjectState> => {
    const response = await page.request.get('/api/project');
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state;
  };
  const human = async (body: Record<string, unknown>) => {
    const response = await page.request.post('/api/commands', {
      data: {
        ...body,
        requestId: crypto.randomUUID(),
        expectedVersion: (await snapshot()).version,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state as ProjectState;
  };
  const register = async (name: string) => {
    const response = await page.request.post('/api/agents', { data: { name } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const registration = await register('Historical presentation fixture agent'),
    client = new Client({ name: 'tailwind-methodology-fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL), {
      requestInit: { headers: { Authorization: `Bearer ${registration.token}` } },
    }),
  );
  const call = async (owner: Client, name: string, args: Record<string, unknown>) => {
    const result = await owner.callTool({
      name,
      arguments: {
        ...args,
        requestId: crypto.randomUUID(),
        expectedVersion: (await snapshot()).version,
      },
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
  };
  const attempt = async (kind: string, agentId: string) => {
    let state = await human({
      type: 'createSpec',
      content: content(`Historical presentation ${kind}`),
    });
    const spec = state.specs.at(-1)!,
      revision = state.revisions.at(-1)!;
    await human({ type: 'activateRevision', specId: spec.id, revisionId: revision.id });
    state = await human({
      type: 'startExecution',
      specId: spec.id,
      specRevisionId: revision.id,
      agentId,
    });
    return { spec, revision, execution: state.executions.at(-1)! };
  };
  const cases: Record<string, Case> = {};
  try {
    for (const kind of [
      'pending',
      'clarification-pending',
      'clarification-replied',
      'resolved',
      'corrected',
    ]) {
      const { spec, execution } = await attempt(kind, registration.agent.id);
      await call(client, 'ouro.confirm_started', { executionId: execution.id });
      await call(client, 'ouro.report_question', {
        executionId: execution.id,
        title: `Проверить основание ${kind}`,
        context: 'Человек принимает отдельное решение по наблюдаемому результату.',
        question: 'Какой результат предъявить?',
        blockingScope: 'execution',
      });
      let state = await snapshot(),
        question = state.requests.findLast((request) => request.executionId === execution.id)!;
      cases[kind] = { specId: spec.id, requestId: question.id, executionId: execution.id };
      if (kind.startsWith('clarification')) {
        state = await human({
          type: 'requestDecisionClarification',
          decisionRequestId: question.id,
          question:
            'Укажите наблюдаемый результат и сохранённый источник проверки.\nИсходное разрешение остаётся отдельным.',
        });
        if (kind === 'clarification-replied') {
          const event = state.events.findLast(
            (event) =>
              event.type === 'DecisionClarificationRequested' &&
              event.payload.decisionRequestId === question.id,
          )!;
          await call(client, 'ouro.submit_decision_clarification', {
            executionId: execution.id,
            decisionRequestId: question.id,
            clarificationEventId: event.id,
            response:
              'Наблюдение подтверждено сохранённой проверкой.\nПриёмку выполняет человек отдельно.',
          });
        }
      }
      if (kind === 'resolved' || kind === 'corrected') {
        state = await human({
          type: 'resolveDecision',
          decisionRequestId: question.id,
          specRevisionId: execution.specRevisionId,
          outcome: { kind: 'answer', answer: 'Первоначальный ответ сохраняется в истории.' },
        });
        if (kind === 'corrected') {
          state = await human({
            type: 'correctDecision',
            decisionRequestId: question.id,
            reason: 'До применения обнаружено более точное ожидание.',
          });
          cases['corrected-original'] = { ...cases[kind] };
          cases[kind].requestId = state.requests.find(
            (request) =>
              request.supersedesDecisionId ===
              state.requests.find((candidate) => candidate.id === question.id)!.decision!.id,
          )!.id;
        }
      }
    }
    for (const kind of ['withdrawn', 'retireable', 'retired']) {
      const { spec, revision, execution } = await attempt(kind, registration.agent.id);
      await call(client, 'ouro.confirm_started', { executionId: execution.id });
      await call(client, 'ouro.report_blocker', {
        executionId: execution.id,
        title: `Недоступен контур проверки ${kind}`,
        context: 'Физическое препятствие исходного контракта.',
        reason:
          'Нет доступа к необходимым исходным данным; продолжение требует отдельного плана человека.',
        expected: 'Контур доступен',
        actual: 'Доступа нет',
        impact: 'Исходная работа остановлена',
        options: [
          {
            id: 'restore',
            title: 'Восстановить доступ',
            description: 'Отдельно проверить восстановленный доступ.',
          },
        ],
      });
      let state = await snapshot(),
        blocker = state.requests.findLast((request) => request.executionId === execution.id)!;
      await call(client, 'ouro.withdraw_decision', {
        executionId: execution.id,
        decisionRequestId: blocker.id,
        reason: 'Первый вопрос неполон; физическое препятствие сохраняется.',
      });
      cases[kind] = { specId: spec.id, requestId: blocker.id, executionId: execution.id };
      if (kind === 'withdrawn') continue;
      state = await human({
        type: 'reopenBlockerPlan',
        decisionRequestId: blocker.id,
        reason: 'Нужен отдельный план по тому же физическому препятствию.',
      });
      const replacement = state.requests.find(
        (request) => request.supersedesRequestId === blocker.id,
      )!;
      cases[kind].requestId = replacement.id;
      state = await human({
        type: 'proposeRevision',
        specId: spec.id,
        content: {
          ...content(`${revision.title} · независимый контур`),
          goal: 'Проверить результат без прежнего внешнего контура.',
        },
      });
      await human({
        type: 'activateRevision',
        specId: spec.id,
        revisionId: state.revisions.at(-1)!.id,
      });
      await call(client, 'ouro.confirm_stopped', { executionId: execution.id });
      await human({
        type: 'cancelExecution',
        executionId: execution.id,
        reason: 'Прежняя попытка остановлена и закрыта перед сменой контракта.',
      });
      if (kind === 'retired')
        await human({
          type: 'retireHistoricalBlocker',
          decisionRequestId: replacement.id,
          reason: 'Новая ревизия исключила зависимость от прежнего контура.',
          evidence:
            'Оператор сверил новую цель и завершение старой попытки.\nФизическое устранение не утверждается.',
        });
    }
  } finally {
    await client.close();
  }
  for (const kind of ['revoked', 'unknown', 'attested']) {
    const owner = await register(`Historical recovery ${kind}`),
      { spec, execution } = await attempt(kind, owner.agent.id),
      agent = new Client({ name: 'tailwind-methodology-recovery-fixture', version: '1' });
    await agent.connect(
      new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL), {
        requestInit: { headers: { Authorization: `Bearer ${owner.token}` } },
      }),
    );
    try {
      await call(agent, 'ouro.confirm_started', { executionId: execution.id });
    } finally {
      await agent.close();
    }
    const response = await page.request.post(`/api/agents/${owner.agent.id}/revoke`, { data: {} });
    expect(response.ok(), await response.text()).toBe(true);
    cases[kind] = { specId: spec.id, executionId: execution.id };
    if (kind !== 'revoked')
      await human({
        type: 'forceCancelRevokedExecution',
        executionId: execution.id,
        reason: 'Связь с отозванным агентом отсутствует.',
        evidence: 'Отзыв ключа подтверждён реестром; физическое состояние неизвестно.',
      });
    if (kind === 'attested')
      await human({
        type: 'attestExternalStop',
        executionId: execution.id,
        evidence:
          'Оператор отдельно проверил завершение внешнего процесса.\nНовое исполнение разрешается отдельной командой.',
      });
  }
  const result = { state: await snapshot(), cases };
  await writeFile(manifest, JSON.stringify(result, null, 2));
  return result;
}

/** Открывает живые browser routes; формы заполняются без отправки команд. */
test('TWM01 historical, lineage and operator recovery presentation preserves immutable facts', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300000);
  const login = await page.request.get('/api/session');
  expect(login.ok(), await login.text()).toBe(true);
  const fixture = await methodologyFixture(page, baseURL!),
    output = resolve(process.env.OURO_METHODOLOGY_VISUAL_DIR ?? '.operations/methodology-original');
  await mkdir(output, { recursive: true });
  const metrics: Record<string, unknown> = {};
  expect((await (await page.request.get('/api/project')).json()).state).toEqual(fixture.state);
  const navigate = async (name: string) => {
    const item = page
      .locator('.sidebar')
      .getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') });
    if (await item.evaluate((element) => element.getBoundingClientRect().right <= 0))
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await item.click();
  };
  for (const theme of ['dark', 'light'])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
      await expect(page.locator('footer')).toContainText('Живые обновления подключены');
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему',
            exact: true,
          })
          .click();
      await page.evaluate(() => document.fonts.ready);
      const capture = async (name: string) => {
        await page.mouse.move(0, 0);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          return new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        const key = `${theme}-${width}-${name}`;
        metrics[key] = await page
          .locator(
            '.historical-panel,.history-cursor-form,.decision-maintenance,.operator-recovery',
          )
          .evaluateAll((roots) =>
            roots.flatMap((root) =>
              [root, ...root.querySelectorAll('*')].map((element) => {
                const s = getComputedStyle(element),
                  b = element.getBoundingClientRect();
                return {
                  tag: element.tagName,
                  x: b.x,
                  y: b.y,
                  width: b.width,
                  height: b.height,
                  display: s.display,
                  padding: s.padding,
                  margin: s.margin,
                  gap: s.gap,
                  color: s.color,
                  background: s.backgroundColor,
                  font: s.font,
                  border: s.border,
                  borderRadius: s.borderRadius,
                  whiteSpace: s.whiteSpace,
                  overflowWrap: s.overflowWrap,
                  flexDirection: s.flexDirection,
                };
              }),
            ),
          );
        await page.screenshot({
          path: join(output, `${key}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      };
      await navigate('История');
      await capture('cursor-form');
      await page.getByRole('spinbutton', { name: 'Исторический cursor', exact: true }).fill('0');
      await page.getByRole('button', { name: 'Открыть состояние на cursor', exact: true }).click();
      const historical = page.getByRole('region', { name: 'Историческое состояние', exact: true });
      await expect(historical).toContainText('В этой точке спеки ещё не созданы');
      await capture('history-empty');
      await historical
        .getByRole('button', { name: 'Вернуться к текущей работе', exact: true })
        .click();
      await page
        .getByRole('spinbutton', { name: 'Исторический cursor', exact: true })
        .fill(String(fixture.state.version));
      await page.getByRole('button', { name: 'Открыть состояние на cursor', exact: true }).click();
      await chooseSelectOption(
        historical.getByLabel('Спецификация в историческом состоянии', { exact: true }),
        fixture.cases['clarification-replied'].specId,
      );
      await capture('history-expectation');
      await historical.getByRole('button', { name: 'Состояния в этой точке', exact: true }).click();
      await capture('history-states');
      await historical.getByRole('button', { name: 'Источники', exact: true }).click();
      await capture('history-sources');
      await historical.locator('.historical-source').getByRole('button').first().click();
      await capture('history-source-record');
      await historical
        .getByRole('button', { name: 'Вернуться к текущей работе', exact: true })
        .click();
      await navigate('Решения');
      const maintenance = page.getByRole('region', {
        name: 'История и уточнения решения',
        exact: true,
      });
      for (const kind of [
        'pending',
        'clarification-pending',
        'clarification-replied',
        'resolved',
        'corrected',
        'corrected-original',
        'withdrawn',
        'retireable',
        'retired',
      ]) {
        await page.getByTestId(`decision-${fixture.cases[kind].requestId}`).click();
        await expect(maintenance).toBeVisible();
        await capture(`decision-${kind}`);
        if (kind === 'clarification-replied') {
          await maintenance
            .getByRole('button', { name: 'Связи с фактами', exact: true })
            .first()
            .click();
          await capture('clarification-source');
        }
        const form =
          kind === 'pending'
            ? ['Запросить уточнение', 'Что нужно уточнить']
            : kind === 'resolved'
              ? ['Исправить отдельным запросом', 'Основание исправления']
              : kind === 'withdrawn'
                ? ['Запросить новый план для блокера', 'Основание нового плана']
                : kind === 'retireable'
                  ? ['Завершить применимость прежнего блокера', 'Почему прежний блокер неприменим']
                  : undefined;
        if (form) {
          await maintenance.getByRole('button', { name: form[0], exact: true }).click();
          await maintenance
            .getByRole('textbox', { name: form[1], exact: true })
            .fill(
              'Человек проверяет отдельное основание действия.\nСуществующие факты остаются неизменными.',
            );
          if (kind === 'retireable')
            await maintenance
              .getByRole('textbox', { name: 'Свидетельство неприменимости', exact: true })
              .fill('Проверена новая область контракта и завершение старой попытки.');
          await capture(`form-${kind}`);
          await maintenance.getByRole('button', { name: 'Отменить ввод', exact: true }).click();
        }
      }
      await navigate('Спецификации');
      for (const kind of ['revoked', 'unknown', 'attested']) {
        const trigger = page.getByLabel('Выбрать спецификацию', { exact: true });
        await selectPopup(trigger);
        await page
          .getByRole('combobox', { name: 'Поиск вариантов: Выбрать спецификацию', exact: true })
          .fill(`Historical presentation ${kind}`);
        await chooseSelectOption(trigger, fixture.cases[kind].specId);
        await page
          .locator('.detail-tabs')
          .getByRole('button', { name: /^Реальность/ })
          .click();
        await page
          .locator('.reality-switch')
          .getByRole('button', { name: 'История', exact: true })
          .click();
        const recovery = page
          .getByRole('region', { name: 'Операторское завершение попытки', exact: true })
          .first();
        await expect(recovery).toBeVisible();
        await capture(`operator-${kind}`);
        if (kind !== 'attested') {
          await recovery
            .getByRole('button', {
              name:
                kind === 'revoked'
                  ? 'Завершить авторизацию отозванного агента'
                  : 'Подтвердить внешнюю остановку',
              exact: true,
            })
            .click();
          if (kind === 'revoked')
            await recovery
              .getByRole('textbox', { name: 'Причина завершения авторизации', exact: true })
              .fill('Связь с отозванным агентом отсутствует.');
          await recovery
            .getByRole('textbox', {
              name: kind === 'revoked' ? 'Основание оператора' : 'Подтверждение внешней остановки',
              exact: true,
            })
            .fill('Отдельное наблюдение человека.\nОформление не меняет разрешение команды.');
          await capture(`operator-form-${kind}`);
          await recovery.getByRole('button', { name: 'Отменить ввод', exact: true }).click();
        }
      }
    }
  expect((await (await page.request.get('/api/project')).json()).state).toEqual(fixture.state);
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
});
