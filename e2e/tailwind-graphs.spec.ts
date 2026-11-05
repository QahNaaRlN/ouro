import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ProjectState, RevisionContent } from '../packages/core/src';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type Fixture = { id: string; plainId: string; pairId: string };

/** Профиль и manifest принадлежат только этой проверке; повторный запуск не создаёт новые факты. */
async function fixture(page: Page): Promise<Fixture> {
  const root = resolve(process.env.OURO_E2E_DATA_DIR!);
  const manifest = join(root, 'graph-visual-fixture.json');
  try {
    return JSON.parse(await readFile(manifest, 'utf8')) as Fixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await page.request.get('/api/session');
  const folder = join(root, 'graph-fixture-root');
  await mkdir(folder, { recursive: true });
  const created = await page.request.post('/api/projects', {
    data: {
      requestId: crypto.randomUUID(),
      name: 'Tailwind graph visual fixture',
      rootPath: folder,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { project } = await created.json();
  const scope = `/api/projects/${project.id}`;
  const state = async (): Promise<ProjectState> => {
    const response = await page.request.get(scope);
    expect(response.ok()).toBe(true);
    return (await response.json()).state;
  };
  const command = async (body: Record<string, unknown>) => {
    const response = await page.request.post(`${scope}/commands`, {
      data: { ...body, requestId: crypto.randomUUID(), expectedVersion: (await state()).version },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state as ProjectState;
  };
  const content: RevisionContent = {
    title: 'Проверить обычный граф',
    goal: 'Сохранить выбор карточки, читаемость и причинные связи.',
    dod: [{ id: 'graph', text: 'Граф проверен человеком.', required: true }],
    constraints: '',
    assumptions: '',
    risks: '',
    inputs: '',
    comment: '',
    flow: {
      entryNodeId: 'action',
      nodes: [
        {
          id: 'action',
          kind: 'action',
          title: 'Изучить исходные факты',
          description: 'Сохранённое ожидание.',
          owner: 'agent',
        },
        {
          id: 'result',
          kind: 'result',
          title: 'Передать результат человеку',
          description: 'DoD принимает человек.',
          owner: 'human',
        },
      ],
      edges: [{ id: 'next', source: 'action', target: 'result', label: 'Передать на проверку' }],
    },
  };
  let current = await command({ type: 'createSpec', content });
  const plain = current.specs.at(-1)!,
    plainRevision = current.revisions.at(-1)!;
  await command({ type: 'activateRevision', specId: plain.id, revisionId: plainRevision.id });
  current = await command({
    type: 'createSpec',
    content: { ...content, title: 'Независимая следующая задача' },
  });
  const dependent = current.specs.at(-1)!;
  await command({ type: 'addDependency', from: plain.id, to: dependent.id });
  current = await command({
    type: 'createSpec',
    content: { ...content, title: 'Парная работа с проверкой' },
  });
  const pair = current.specs.at(-1)!,
    pairRevision = current.revisions.at(-1)!;
  await command({ type: 'activateRevision', specId: pair.id, revisionId: pairRevision.id });
  await command({
    type: 'addDependency',
    from: dependent.id,
    to: pair.id,
    relationship: 'relates_to',
  });
  const { flow: _, ...verificationContent } = content;
  await command({
    type: 'createSpec',
    content: {
      ...verificationContent,
      title: 'Проверка парной работы',
      verification: {
        version: 1,
        targetSpecId: pair.id,
        targetRevisionId: pairRevision.id,
        criterionIds: ['graph'],
        workflow: 'tdd',
        cases: [
          {
            id: 'case',
            criterionIds: ['graph'],
            given: 'Сохранённая карта',
            action: 'Открыть обе стороны',
            expected: 'Геометрия и выбор сохранены.',
            data: 'Отдельный профиль',
            prerequisites: 'Ожидание активно.',
            level: 'e2e',
            purpose: 'acceptance',
            required: true,
            procedure: { kind: 'manual', instructions: 'Проверить карту.' },
          },
        ],
      },
    },
  });
  const result = { id: project.id, plainId: plain.id, pairId: pair.id };
  await writeFile(manifest, JSON.stringify(result));
  return result;
}

test('TWG01 graph library slots preserve both themes, plain and paired nodes, shared controls and keyboard focus', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(180000);
  await page.request.get('/api/session');
  const data = await fixture(page);
  const scope = `/api/projects/${data.id}`;
  const snapshot = async (): Promise<ProjectState> => {
    const response = await page.request.get(scope);
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state;
  };
  if (!(await snapshot()).requests.length) {
    const issued = await page.request.post(`${scope}/agents`, {
      data: { name: 'Graph presentation fixture agent' },
    });
    expect(issued.ok()).toBe(true);
    const registration = await issued.json();
    const client = new Client({ name: 'tailwind-graph-fixture', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${scope}/mcp`, baseURL), {
        requestInit: { headers: { Authorization: `Bearer ${registration.token}` } },
      }),
    );
    try {
      for (const specId of [data.plainId, data.pairId]) {
        const current = await snapshot(),
          spec = current.specs.find((item) => item.id === specId)!;
        const started = await page.request.post(`${scope}/commands`, {
          data: {
            type: 'startExecution',
            specId,
            specRevisionId: spec.activeRevisionId,
            agentId: registration.agent.id,
            requestId: crypto.randomUUID(),
            expectedVersion: current.version,
          },
        });
        expect(started.ok(), await started.text()).toBe(true);
        const execution = (await started.json()).state.executions.at(-1)!;
        const call = async (name: string, args: Record<string, unknown> = {}) => {
          const result = await client.callTool({
            name,
            arguments: {
              executionId: execution.id,
              requestId: crypto.randomUUID(),
              expectedVersion: (await snapshot()).version,
              ...args,
            },
          });
          expect(result.isError, JSON.stringify(result)).not.toBe(true);
        };
        await call('ouro.confirm_started');
        await call('ouro.report_action', {
          actionId: crypto.randomUUID(),
          phase: 'completed',
          title: 'Факт для проверки отображения',
          context: 'Изолированная проверка ссылок и стилей.',
          evidence: 'test://tailwind-graphs',
        });
        const source = await snapshot();
        await call('ouro.submit_proposal', {
          sourceCursor: source.version,
          content: {
            kind: 'reality_summary',
            title: 'Предложение для карты',
            findings: [
              {
                text: 'Ссылка относится к сохранённому факту.',
                sourceEventIds: [source.events.at(-1)!.id],
              },
            ],
            interpretation: 'Человек рассматривает предложение.',
            limitations: 'Отдельный fixture-профиль.',
          },
        });
        await call('ouro.report_question', {
          title: 'Вопрос для карты',
          context: 'Сохранить точную ссылку и отображение запроса.',
          question: 'Какие факты проверить?',
          blockingScope: 'execution',
        });
      }
    } finally {
      await client.close();
    }
  }
  const output = resolve(process.env.OURO_TAILWIND_VISUAL_DIR ?? testInfo.outputPath('visual'));
  await mkdir(output, { recursive: true });
  const metrics: Record<string, unknown> = {};
  for (const theme of ['dark', 'light'])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const open = async (url: string) => {
        await page.goto(url);
        await expect(page.locator('.react-flow__node').first()).toBeAttached();
        if (url === '/') {
          if ((await page.locator('html').getAttribute('data-theme')) !== theme)
            await page
              .getByRole('button', {
                name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему',
                exact: true,
              })
              .click();
        } else
          await page.evaluate(
            (value) => document.documentElement.setAttribute('data-theme', value),
            theme,
          );
        await page.evaluate(() => document.fonts.ready);
      };
      const capture = async (view: string) => {
        await page.mouse.move(0, 0);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const key = `${theme}-${width}-${view}`;
        metrics[key] = await page.locator('.react-flow').evaluateAll((roots) =>
          roots.flatMap((root) =>
            Array.from(
              root.querySelectorAll(
                '.react-flow__node,.spec-node,.node-top,.node-title,.node-goal,.node-bottom,.node-revision,.node-attention,.node-proposals,.node-updated,.react-flow__handle,.react-flow__controls,.react-flow__controls-button,.react-flow__controls-button svg,.react-flow__minimap,.react-flow__minimap svg,.react-flow__attribution,.react-flow__edge-path,.react-flow__edge-text,.react-flow__edge-textbg',
              ),
            ).map((element) => {
              const s = getComputedStyle(element),
                b = element.getBoundingClientRect();
              return {
                hook: element.classList[0],
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
                fill: s.fill,
                stroke: s.stroke,
                strokeWidth: s.strokeWidth,
                strokeDasharray: s.strokeDasharray,
                opacity: s.opacity,
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
      if (process.env.OURO_TAILWIND_PAIR_ONLY === '1') {
        testInfo.annotations.push({
          type: 'scope',
          description: 'Только четыре paired presentation состояния после изменения slot API.',
        });
        await open(`/projects/${data.id}`);
        const pair = page.locator(`.react-flow__node[data-id="${data.pairId}"] .verification-pair`);
        await expect(pair).toBeVisible();
        await pair.getByRole('button', { name: 'Проверка', exact: true }).click();
        await capture('pair-verification');
        continue;
      }
      await open('/');
      await expect(page.locator('.graph-container .react-flow__node').first()).toBeVisible();
      await capture('legacy');
      await open(`/projects/${data.id}`);
      const graph = page.locator('.workspace-roadmap');
      await expect(graph.locator('.react-flow__node')).toHaveCount(3);
      await graph.getByRole('button', { name: 'Вписать граф', exact: true }).click();
      await capture('roadmap');
      const plain = graph.locator(`.react-flow__node[data-id="${data.plainId}"]`);
      await plain.focus();
      await capture('roadmap-focus');
      await plain.press('Enter');
      const detail = page.getByRole('region', { name: 'Выбранная задача', exact: true });
      await expect(detail).toBeVisible();
      await detail
        .getByRole('navigation', { name: 'Разделы спецификации', exact: true })
        .getByRole('button', { name: 'Процесс', exact: true })
        .click();
      await detail.getByRole('button', { name: 'Фактическое исполнение', exact: true }).click();
      await expect(detail.locator('.workspace-reality .react-flow__node').first()).toBeVisible();
      await capture('actual');
      await detail.getByRole('button', { name: 'План', exact: true }).click();
      await expect(detail.locator('.process-canvas .react-flow__node')).toHaveCount(2);
      await capture('process');
      await open(`/projects/${data.id}`);
      const pair = page.locator(`.react-flow__node[data-id="${data.pairId}"] .verification-pair`);
      await expect(pair).toBeVisible();
      await pair.getByRole('button', { name: 'Проверка', exact: true }).click();
      await capture('pair-verification');
    }
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
});
