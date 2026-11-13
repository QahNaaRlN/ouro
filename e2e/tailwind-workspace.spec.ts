import { test, expect, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ProjectState, RevisionContent } from '../packages/core/src';
import { selectPopup } from './select-helpers';

type VisualProject = { id: string; name: string; rootPath: string | null };
type VisualSnapshot = { state: ProjectState; cursor: number };
const scope = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const content = (title: string): RevisionContent => ({
  title,
  goal: 'Сохранить оформление, доступность и текущие пользовательские действия при переводе стилей.',
  dod: [{ id: 'visual', text: 'Интерфейс проверен в светлой и тёмной темах.', required: true }],
  constraints: '',
  assumptions: '',
  risks: '',
  inputs: '',
  comment: '',
});

/** Использует один отдельный fixture-проект до и после переноса, сохраняя идентификаторы и даты снимков. */
async function visualProject(page: Page, baseURL: string) {
  const rootPath = resolve('.operations/tailwind-workspace-root');
  await mkdir(rootPath, { recursive: true });
  await page.request.get('/api/session');
  const catalog = (await (await page.request.get('/api/projects')).json()) as {
    projects: VisualProject[];
  };
  let project = catalog.projects.find((item) => item.rootPath === rootPath);
  if (!project) {
    const created = await page.request.post('/api/projects', {
      data: { requestId: crypto.randomUUID(), rootPath, name: 'Оформление рабочего места' },
    });
    expect(created.ok()).toBe(true);
    project = (await created.json()).project as VisualProject;
    const issued = await page.request.post(`${scope(project.id)}/agents`, {
      data: { name: 'Исполнитель оформления' },
    });
    expect(issued.ok()).toBe(true);
    const registration = (await issued.json()) as { agent: { id: string }; token: string };
    const executions: string[] = [];
    for (const title of ['Проверить рабочее место', 'Сохранить доступность управления']) {
      const current = (await (await page.request.get(scope(project.id))).json()) as VisualSnapshot;
      const assigned = await page.request.post(`${scope(project.id)}/tasks`, {
        data: {
          requestId: crypto.randomUUID(),
          expectedVersion: current.cursor,
          agentId: registration.agent.id,
          content: content(title),
        },
      });
      expect(assigned.ok()).toBe(true);
      executions.push(((await assigned.json()).state as ProjectState).executions.at(-1)!.id);
    }
    const client = new Client({ name: 'ouro-tailwind-workspace-fixture', version: '1' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${scope(project.id)}/mcp`, baseURL), {
          requestInit: { headers: { Authorization: `Bearer ${registration.token}` } },
        }),
      );
      const call = async (name: string, extra: Record<string, unknown> = {}) => {
        const current = (await (
          await page.request.get(scope(project!.id))
        ).json()) as VisualSnapshot;
        const result = await client.callTool({
          name,
          arguments: {
            executionId: executions[0],
            requestId: crypto.randomUUID(),
            expectedVersion: current.cursor,
            ...extra,
          },
        });
        expect(result.isError).not.toBe(true);
      };
      await call('ouro.confirm_started');
      for (const title of ['Как проверить результат?', 'Вопрос с черновиком'])
        await call('ouro.report_question', {
          title,
          context:
            'Перед сравнением представления требуется сохранить проверяемое основание и отдельное решение человека.',
          question: 'Какое наблюдение использовать для подтверждения результата?',
          blockingScope: 'none',
        });
      const current = (await (await page.request.get(scope(project.id))).json()) as VisualSnapshot;
      const request = current.state.requests.find(
        (item) => item.title === 'Как проверить результат?',
      )!;
      const answered = await page.request.post(`${scope(project.id)}/commands`, {
        data: {
          type: 'resolveDecision',
          requestId: crypto.randomUUID(),
          expectedVersion: current.cursor,
          decisionRequestId: request.id,
          specRevisionId: request.specRevisionId,
          outcome: {
            kind: 'answer',
            answer: 'Сверить исходный и итоговый интерфейс на отдельных fixture-данных.',
          },
        },
      });
      expect(answered.ok()).toBe(true);
    } finally {
      await client.close();
    }
  }
  const snapshot = (await (await page.request.get(scope(project.id))).json()) as VisualSnapshot;
  expect(snapshot.state.specs).toHaveLength(2);
  expect(snapshot.state.requests).toHaveLength(2);
  return { project, snapshot };
}

/** Записывает измеряемые свойства только видимых собственных workspace slots. */
async function presentation(page: Page) {
  return page
    .locator(
      '.ws-topbar,.ws-main,.ws-heading,.ws-project-heading,.ws-project-navigation,.ws-panel,.ws-section-top,.ws-request,.ws-history-row,.ws-project-card,.ws-dialog[open],.ws-shell h1,.ws-shell h2,.ws-shell h3,.ws-shell h4,.ws-shell p,.ws-shell nav,.ws-brand,.ws-shell button,.ws-shell input,.ws-shell textarea',
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const css = getComputedStyle(node),
            box = node.getBoundingClientRect();
          return {
            slot: (node.getAttribute('class') ?? '')
              .split(' ')
              .filter((value) => value.startsWith('ws-'))
              .join(' '),
            tag: node.tagName,
            width: box.width,
            height: box.height,
            padding: css.padding,
            margin: css.margin,
            display: css.display,
            border: css.border,
            borderRadius: css.borderRadius,
            background: css.backgroundColor,
            color: css.color,
            font: css.font,
            gap: css.gap,
          };
        }),
    );
}

test('WTW01 workspace retains catalog, project, review, history and native dialogs across themes and viewports', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(180000);
  expect(baseURL).toBeTruthy();
  const { project, snapshot } = await visualProject(page, baseURL!);
  const output = process.env.OURO_TAILWIND_VISUAL_DIR
    ? resolve(process.env.OURO_TAILWIND_VISUAL_DIR)
    : testInfo.outputPath('visual');
  await mkdir(output, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    /** Фиксирует допустимый connecting-вид для визуального сравнения; реальные SSE проверяются отдельными regressions. */
    class VisualEventSource extends EventTarget {
      onopen: ((event: Event) => unknown) | null = null;
      onerror: ((event: Event) => unknown) | null = null;
      constructor(_url: string) {
        super();
      }
      close() {}
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: VisualEventSource });
  });
  const metrics: Record<string, Awaited<ReturnType<typeof presentation>>> = {};
  for (const theme of ['dark', 'light'] as const)
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const prefix = `${theme}-${viewport.width}`;
      const capture = async (name: string) => {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.evaluate(() => document.fonts.ready);
        metrics[`${prefix}-${name}`] = await presentation(page);
        await page.screenshot({
          path: join(output, `${prefix}-${name}.png`),
          animations: 'disabled',
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
      };
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
      await expect(
        page
          .getByRole('link')
          .filter({ has: page.getByRole('heading', { name: project.name, exact: true }) }),
      ).toBeVisible();
      await capture('catalog');
      for (const view of ['roadmap', 'questions', 'history', 'agents']) {
        await page.goto(`/projects/${project.id}?view=${view}`);
        await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
        if (view === 'questions')
          await expect(
            page.getByRole('region', { name: 'Вопросы и решения', exact: true }),
          ).toBeVisible();
        if (view === 'history')
          await expect(
            page.getByRole('region', { name: 'История проекта', exact: true }),
          ).toBeVisible();
        if (view === 'agents')
          await expect(
            page.getByRole('region', { name: 'Зарегистрированные агенты', exact: true }),
          ).toBeVisible();
        await capture(view);
      }
      await page.goto(`/projects/${project.id}?view=questions`);
      await page
        .getByRole('region', { name: 'Вопросы и решения', exact: true })
        .getByRole('button', { name: 'Вопрос с черновиком', exact: true })
        .click();
      const decision = page.getByRole('dialog', { name: 'Запрос решения', exact: true });
      await expect(decision).toBeVisible();
      await decision
        .getByRole('textbox', { name: 'Ответ на вопрос Вопрос с черновиком', exact: true })
        .fill('Неотправленное решение для сравнения формы.');
      await capture('decision-dialog');
      await page.keyboard.press('Escape');
      await expect(decision).not.toBeVisible();
      await page.goto(
        `/projects/${project.id}?view=spec&spec=${snapshot.state.specs[0].id}&tab=overview`,
      );
      const selected = page.getByRole('region', { name: 'Выбранная задача', exact: true });
      await expect(
        selected.getByRole('heading', { name: snapshot.state.specs[0].title, exact: true }),
      ).toBeVisible();
      await capture('spec-overview');
      await selected.getByRole('button', { name: 'Управление попыткой', exact: true }).click();
      await capture('spec-controls');
      await page.goto(`/projects/${project.id}?view=agents`);
      await expect(
        page.getByRole('region', { name: 'Зарегистрированные агенты', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Назначить работу', exact: true }).click();
      const task = page.getByRole('dialog', { name: 'Назначить работу агенту', exact: true });
      await expect(task).toBeVisible();
      await task
        .getByRole('textbox', { name: 'Название задачи', exact: true })
        .fill('Неотправленное ожидание');
      await task
        .getByRole('textbox', { name: 'Задача для агента', exact: true })
        .fill('Сохранить черновик и прежнюю геометрию формы.');
      await capture('task-dialog');
      await page.keyboard.press('Escape');
      await expect(task).not.toBeVisible();
      await page.getByRole('button', { name: 'Подключить агента', exact: true }).click();
      const connection = page.getByRole('dialog', { name: 'Подключить агента', exact: true });
      await expect(connection).toBeVisible();
      await capture('connection-dialog');
      await page.keyboard.press('Escape');
      await expect(connection).not.toBeVisible();
    }
  const after = (await (await page.request.get(scope(project.id))).json()) as VisualSnapshot;
  expect(after.cursor).toBe(snapshot.cursor);
  expect(after.state).toEqual(snapshot.state);
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
});

test('WTW02 ProjectSwitcher keeps a full-width consumer appearance and dismisses its list without changing the project', async ({
  page,
}) => {
  await page.goto('/');
  const project = page.getByRole('combobox', { name: 'Текущий проект', exact: true });
  await expect(project).toBeVisible();
  await expect(page.locator('.workspace-switch label').filter({ has: project })).toBeVisible();
  await expect(project).toHaveAttribute('data-value', /\S+/);
  const selected = await project.getAttribute('data-value');
  const geometry = await project.evaluate((node) => {
    const css = getComputedStyle(node),
      label = node.closest('label');
    if (!label)
      throw new Error(
        `Контрол выбора оказался вне своего label: ${node.parentElement?.outerHTML.slice(0, 2000)}`,
      );
    return {
      width: node.getBoundingClientRect().width,
      labelWidth: label.getBoundingClientRect().width,
      padding: css.padding,
    };
  });
  expect(Math.abs(geometry.width - geometry.labelWidth)).toBeLessThan(1);
  expect(geometry.padding).toBe('8px');
  const popup = await selectPopup(project);
  await expect(popup.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(project).toBeFocused();
  await expect(project).toHaveAttribute('data-value', selected ?? '');
  await expect(page).toHaveURL(/\/$/);
});

test('WTW03 legacy impact disclosures keep explicit trigger geometry, keyboard focus and read-only domain state', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
  const current = async () =>
    (await (await page.request.get('/api/project')).json()).state as ProjectState;
  const command = async (extra: Record<string, unknown>) => {
    const response = await page.request.post('/api/commands', {
      data: {
        ...extra,
        requestId: crypto.randomUUID(),
        expectedVersion: (await current()).version,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state as ProjectState;
  };
  let state = await command({
    type: 'createSpec',
    content: content('Основание проверки оформления'),
  });
  const spec = state.specs.at(-1)!,
    first = state.revisions.at(-1)!;
  state = await command({ type: 'activateRevision', specId: spec.id, revisionId: first.id });
  const baseline = state.version;
  state = await command({
    type: 'proposeRevision',
    specId: spec.id,
    content: { ...content(first.title), goal: 'Изменённое ожидание с первичным основанием.' },
  });
  state = await command({
    type: 'activateRevision',
    specId: spec.id,
    revisionId: state.revisions.at(-1)!.id,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Показатели', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Показатели ожиданий', exact: true });
  await panel.getByLabel('Исходная точка истории', { exact: true }).fill(String(baseline));
  await panel.getByRole('button', { name: 'Пересчитать отчёт', exact: true }).click();
  const source = panel
    .getByRole('group', { name: `Основание изменения ${spec.humanId}` })
    .locator('.impact-source>.ws-accordion-trigger')
    .first();
  await expect(source).toBeVisible();
  expect(
    await source.evaluate((node) => {
      const css = getComputedStyle(node);
      return { padding: css.padding, fontSize: css.fontSize, lineHeight: css.lineHeight };
    }),
  ).toEqual({ padding: '10px 12px', fontSize: '11px', lineHeight: '18.15px' });
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(source).toHaveAttribute('aria-expanded', 'true');
  await expect(source).toBeFocused();
  await expect(
    source
      .locator('..')
      .locator('.impact-source-meta')
      .getByText('RevisionActivated', { exact: true }),
  ).toBeVisible();
  const method = panel.locator('.impact-method>.ws-accordion-trigger');
  expect(
    await method.evaluate((node) => {
      const css = getComputedStyle(node);
      return { padding: css.padding, fontSize: css.fontSize, lineHeight: css.lineHeight };
    }),
  ).toEqual({ padding: '6px 0px', fontSize: '12px', lineHeight: '18px' });
  await method.focus();
  await page.keyboard.press('Enter');
  await expect(method).toHaveAttribute('aria-expanded', 'true');
  await expect(method).toBeFocused();
  await expect(panel.getByText('100 × K / N.', { exact: true })).toBeVisible();
  expect((await current()).version).toBe(state.version);
});

test('WTW04 active project and spec tabs retain their underline on hover', async ({
  page,
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const { project, snapshot } = await visualProject(page, baseURL!);
  await page.goto(
    `/projects/${project.id}?view=spec&spec=${snapshot.state.specs[0].id}&tab=overview`,
  );
  for (const navigation of [
    page.getByRole('navigation', { name: 'Разделы проекта', exact: true }),
    page.getByRole('navigation', { name: 'Разделы спецификации', exact: true }),
  ]) {
    const active = navigation.locator('button[aria-current]');
    await expect(active).toBeVisible();
    const color = await active.evaluate((node) => getComputedStyle(node).borderBottomColor);
    expect(color).toBe(
      await active.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--positive)';
        node.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }),
    );
    await active.hover();
    expect(await active.evaluate((node) => getComputedStyle(node).borderBottomColor)).toBe(color);
  }
  const hidden = page.locator('.ws-shell [hidden]');
  expect(await hidden.count()).toBeGreaterThan(0);
  expect(
    await hidden.evaluateAll((nodes) =>
      nodes
        .filter((node) => getComputedStyle(node).display !== 'none')
        .map((node) => node.getAttribute('class')),
    ),
  ).toEqual([]);
});
