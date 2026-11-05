import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  impactLessonsPassword,
  readImpactLessonsFixture,
  type ImpactLessonsFixture,
} from './impact-lessons-fixture';
import { chooseSelectOption } from './select-helpers';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
  if (
    (await menu.isVisible()) &&
    !(await page.locator('.sidebar').evaluate((node) => node.classList.contains('mobile-open')))
  )
    await menu.click();
  await page
    .getByRole('navigation', { name: 'Основная навигация', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}

/** Каждый scene получает отдельную сессию; авторизация реальна, domain facts не изменяются. */
async function openScene(
  browser: Browser,
  baseURL: string,
  fixture: ImpactLessonsFixture,
  theme: 'dark' | 'light',
  width: number,
  empty = false,
  viewer = false,
) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height: width === 1440 ? 1000 : 844 },
    reducedMotion: 'reduce',
    timezoneId: 'Asia/Yekaterinburg',
  });
  await context.addCookies([
    {
      name: 'ouro_project',
      value: empty ? fixture.emptyProjectId : fixture.projectId,
      url: baseURL,
    },
  ]);
  const login = await context.request.post('/api/auth/login', {
    data: {
      email: viewer ? fixture.viewerEmail : fixture.ownerEmail,
      password: impactLessonsPassword,
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
  if ((await page.locator('html').getAttribute('data-theme')) !== theme)
    await page
      .getByRole('button', {
        name: theme === 'light' ? 'Включить светлую тему' : 'Включить тёмную тему',
        exact: true,
      })
      .click();
  return { page, close: () => context.close() };
}

async function computed(target: Locator) {
  return target.evaluate((root) =>
    [
      root,
      ...root.querySelectorAll(
        'h1,h2,h3,p,button,input,textarea,label,fieldset,legend,section,article,code,pre,table,th,td,small,strong,dl,dt,dd,[class*="impact-"],[class*="lesson-"]',
      ),
    ]
      .filter((node) => node.getClientRects().length)
      .map((node) => {
        const box = node.getBoundingClientRect(),
          css = getComputedStyle(node);
        return {
          tag: node.tagName,
          text: (node.textContent ?? '').trim().slice(0, 80),
          width: box.width,
          height: box.height,
          padding: css.padding,
          margin: css.margin,
          gap: css.gap,
          border: css.border,
          borderRadius: css.borderRadius,
          color: css.color,
          background: css.backgroundColor,
          font: css.font,
          display: css.display,
          whiteSpace: css.whiteSpace,
          outline: css.outline,
          outlineOffset: css.outlineOffset,
        };
      }),
  );
}

async function configureImpact(
  panel: Locator,
  fixture: ImpactLessonsFixture,
  mode: 'zero' | 'fifty' | 'sources' | 'scoped' | 'empty-scope' | 'unknown-window',
) {
  await panel.getByLabel('Исходная точка истории', { exact: true }).fill(String(fixture.c0));
  if (mode === 'zero' || mode === 'unknown-window') {
    await chooseSelectOption(
      panel.getByRole('combobox', { name: 'Конечная точка отчёта', exact: true }),
      'historical',
    );
    await panel
      .getByLabel('Конечная точка истории', { exact: true })
      .fill(String(mode === 'zero' ? fixture.c0 : 0));
  }
  if (mode !== 'unknown-window') {
    await chooseSelectOption(
      panel.getByRole('combobox', { name: 'Область отчёта', exact: true }),
      'selected',
    );
    for (const [index, spec] of fixture.specs.entries()) {
      const option = panel.getByRole('checkbox', {
        name: spec.humanId + ' — ' + spec.title,
        exact: true,
      });
      if (mode !== 'empty-scope' && (mode !== 'scoped' || index === 0)) await option.check();
      else await expect(option).not.toBeChecked();
    }
  }
  await panel.getByRole('button', { name: 'Пересчитать отчёт', exact: true }).click();
  if (mode === 'unknown-window') {
    await expect(panel).toContainText('Недостаточно данных для расчёта');
    await expect(panel).toContainText('Счётчики недоступны');
    return;
  }
  if (mode === 'empty-scope') {
    await expect(panel).toContainText('Область пуста');
    await expect(
      panel.getByLabel('Доля изменённых исходных ожиданий', { exact: true }),
    ).toHaveCount(0);
    return;
  }
  const percent = mode === 'zero' ? '0,0%' : mode === 'scoped' ? '100,0%' : '50,0%';
  await expect(panel.getByLabel('Доля изменённых исходных ожиданий', { exact: true })).toHaveText(
    percent,
  );
  const meter = panel.locator('.impact-meter'),
    fill = meter.locator(':scope > span'),
    geometry = await meter.evaluate((node) => {
      const css = getComputedStyle(node);
      return (
        node.getBoundingClientRect().width -
        parseFloat(css.borderLeftWidth) -
        parseFloat(css.borderRightWidth)
      );
    });
  expect(await fill.evaluate((node) => node.getBoundingClientRect().width)).toBeCloseTo(
    geometry * (mode === 'zero' ? 0 : mode === 'scoped' ? 1 : 0.5),
    0,
  );
  if (mode === 'zero')
    expect(await panel.locator('.impact-count-card dd > strong').allTextContents()).toEqual(
      Array(12).fill('0'),
    );
  if (mode === 'sources') {
    const source = panel.getByRole('group', {
      name: 'Основание изменения ' + fixture.specs[0].humanId,
      exact: true,
    });
    await source.locator('.ws-accordion-trigger').first().click();
    await expect(source).toContainText('RevisionActivated');
    await panel.getByRole('button', { name: /^Исходная база ·/ }).click();
    await panel.getByRole('button', { name: 'Как считается показатель', exact: true }).click();
    await expect(
      panel.getByRole('table', { name: 'Исходная база отчёта', exact: true }),
    ).toBeVisible();
  }
}

async function newLesson(panel: Locator, fixture: ImpactLessonsFixture) {
  await panel.getByRole('button', { name: 'Новый урок', exact: true }).click();
  const editor = panel.getByRole('region', { name: 'Редактор урока', exact: true });
  for (const [name, value] of [
    ['Название урока', 'Несохранённая проверяемая граница'],
    ['Контекст урока', 'Контекст остаётся в этой открытой форме.'],
    ['Вывод урока', 'Вывод требует человеческой проверки.'],
    ['Область применимости', 'Для данного источника и отдельного контекста.'],
    ['Основание проверки', 'Наблюдение из неизменённой истории.'],
  ] as const)
    await editor.getByRole('textbox', { name, exact: true }).fill(value);
  await chooseSelectOption(
    editor.getByRole('combobox', { name: 'Добавить источник урока', exact: true }),
    fixture.sourceEventId,
  );
  await editor.getByRole('button', { name: 'Добавить источник', exact: true }).click();
  return editor;
}

test('ILV01 real impact windows and lesson states preserve frozen presentation, authority and domain facts', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(480000);
  expect(baseURL).toBeTruthy();
  const fixture = await readImpactLessonsFixture(),
    output = resolve(process.env.OURO_IMPACT_LESSONS_VISUAL_DIR ?? testInfo.outputPath('visual'));
  await mkdir(output, { recursive: true });
  const login = await page.request.post('/api/auth/login', {
    data: { email: fixture.ownerEmail, password: impactLessonsPassword },
  });
  expect(login.ok()).toBe(true);
  const snapshot = async (id: string) => {
    const response = await page.request.get('/api/projects/' + id);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const read = async () => ({
    main: await snapshot(fixture.projectId),
    empty: await snapshot(fixture.emptyProjectId),
  });
  const before = await read();
  expect(before.main.state.version).toBe(fixture.version);
  const metrics: Record<string, unknown> = {},
    overflow: Record<string, number> = {};
  const capture = async (name: string, target: Locator) => {
    await target.page().evaluate(() => document.fonts.ready);
    await target.scrollIntoViewIfNeeded();
    await target
      .page()
      .evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    metrics[name] = await computed(target);
    overflow[name] = await target.page().evaluate(() => document.documentElement.scrollWidth);
    expect(overflow[name]).toBeLessThanOrEqual(target.page().viewportSize()!.width);
    await target.screenshot({
      path: join(output, name + '.png'),
      animations: 'disabled',
      caret: 'hide',
    });
  };
  for (const theme of ['dark', 'light'] as const)
    for (const width of [1440, 390]) {
      const prefix = theme + '-' + width;
      for (const scene of [
        'empty',
        'no-baseline',
        'unknown-window',
        'zero',
        'fifty',
        'sources',
        'scoped',
        'empty-scope',
        'controls',
      ] as const) {
        const opened = await openScene(browser, baseURL!, fixture, theme, width, scene === 'empty');
        try {
          await navigate(opened.page, 'Показатели');
          const panel = opened.page.getByRole('region', {
            name: 'Показатели ожиданий',
            exact: true,
          });
          await expect(panel).toBeVisible();
          if (scene === 'empty' || scene === 'no-baseline')
            await expect(panel).toContainText('Нет исходной утверждённой базы');
          else if (scene === 'controls') {
            const baseline = panel.getByLabel('Исходная точка истории', { exact: true });
            await baseline.fill(String(fixture.c0));
            await baseline.focus();
            await expect(panel).toContainText('Параметры изменены');
            await expect(baseline).toBeFocused();
          } else await configureImpact(panel, fixture, scene);
          await capture(prefix + '-impact-' + scene, panel);
        } finally {
          await opened.close();
        }
      }
      for (const scene of [
        'empty',
        'list',
        'published',
        'filtered',
        'empty-filter',
        'source',
        'editor',
        'candidate-editor',
        'spec-editor',
        'error',
        'unknown',
        'read-only',
      ] as const) {
        const opened = await openScene(
          browser,
          baseURL!,
          fixture,
          theme,
          width,
          scene === 'empty',
          scene === 'read-only',
        );
        try {
          await navigate(opened.page, 'Уроки');
          const panel = opened.page.locator('.lessons-panel');
          await expect(
            panel.getByRole('heading', { name: 'Архив уроков', exact: true }),
          ).toBeVisible();
          if (scene === 'empty') await expect(panel).toContainText('Уроки не найдены');
          if (scene === 'published' || scene === 'spec-editor')
            await chooseSelectOption(
              panel.getByRole('combobox', { name: 'Версия урока', exact: true }),
              fixture.lesson.publishedRevisionId,
            );
          if (scene === 'filtered' || scene === 'empty-filter') {
            await panel
              .getByRole('searchbox', { name: 'Поиск уроков', exact: true })
              .fill(scene === 'filtered' ? fixture.draftLesson.title : 'нет-такого-урока');
            await expect(panel).toContainText('Выбор сохранён');
          }
          if (scene === 'source') {
            const detail = panel.getByRole('article', { name: 'Выбранный урок', exact: true });
            await detail.locator('.ws-accordion-trigger').nth(1).click();
            await expect(detail.locator('pre').nth(1)).toContainText('"required": false');
          }
          if (scene === 'candidate-editor')
            await panel
              .getByTestId('lesson-candidate-' + fixture.candidateId)
              .getByRole('button', { name: 'Разобрать кандидат', exact: true })
              .click();
          if (scene === 'spec-editor') {
            await panel
              .getByRole('button', { name: 'Создать спеку из урока', exact: true })
              .click();
            const editor = panel.getByRole('region', {
                name: 'Спецификация из урока',
                exact: true,
              }),
              goal = editor.getByRole('textbox', { name: 'Цель новой спеки', exact: true });
            await goal.fill('Несохранённая цель из опубликованного источника.');
            await goal.focus();
            await goal.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(3, 14));
            await expect(goal).toBeFocused();
          }
          if (scene === 'editor' || scene === 'error' || scene === 'unknown') {
            const editor = await newLesson(panel, fixture),
              field = editor.getByRole('textbox', { name: 'Контекст урока', exact: true });
            await field.focus();
            await field.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(3, 14));
            if (scene === 'editor') {
              await expect(field).toBeFocused();
              expect(
                await field.evaluate((node: HTMLTextAreaElement) => [
                  node.selectionStart,
                  node.selectionEnd,
                ]),
              ).toEqual([3, 14]);
            } else {
              await opened.page.route('**/api/commands**', (route) =>
                route.fulfill({
                  status: scene === 'error' ? 422 : 503,
                  json: {
                    error: {
                      code: scene === 'error' ? 'VALIDATION_ERROR' : 'PRESENTATION_UNAVAILABLE',
                      message: 'Изолированная ошибка: данные формы сохранены.',
                    },
                  },
                }),
              );
              await editor
                .getByRole('button', { name: 'Сохранить черновик урока', exact: true })
                .click();
              await expect(panel.getByRole('alert')).toContainText('Изолированная ошибка');
              await expect(field).toHaveValue('Контекст остаётся в этой открытой форме.');
              if (scene === 'unknown') {
                await expect(panel).toContainText('Ответ сохранения не подтверждён');
                await expect(field).toBeDisabled();
              } else await expect(field).toBeEnabled();
            }
          }
          if (scene === 'read-only') {
            await expect(
              panel.getByRole('button', { name: 'Новый урок', exact: true }),
            ).toBeDisabled();
            await expect(
              panel.getByRole('button', { name: 'Предложить ревизию урока', exact: true }),
            ).toBeDisabled();
            await expect(
              panel.getByRole('searchbox', { name: 'Поиск уроков', exact: true }),
            ).toBeEnabled();
          }
          await capture(prefix + '-lessons-' + scene, panel);
        } finally {
          await opened.close();
        }
      }
    }
  expect(await read()).toEqual(before);
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
  await writeFile(join(output, 'overflow.json'), JSON.stringify(overflow, null, 2));
});

test('ILV02 empty disclosure and closed method preserve mounted content, spacing and keyboard focus', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  expect(baseURL).toBeTruthy();
  const fixture = await readImpactLessonsFixture();
  for (const theme of ['dark', 'light'] as const)
    for (const width of [1440, 390]) {
      const opened = await openScene(browser, baseURL!, fixture, theme, width, true);
      try {
        await navigate(opened.page, 'Показатели');
        const panel = opened.page.getByRole('region', { name: 'Показатели ожиданий', exact: true }),
          baseline = panel.locator('.impact-baseline');
        await baseline.getByRole('button', { name: /^Исходная база ·/ }).click();
        const helper = baseline.locator('.helper-note');
        await expect(helper).toBeVisible();
        expect(await helper.evaluate((node) => getComputedStyle(node).marginTop)).toBe('14px');
        const method = panel.locator('.impact-method'),
          trigger = method.getByRole('button', { name: 'Как считается показатель', exact: true }),
          grid = method.locator(':scope > .ws-accordion-grid');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(await grid.evaluate((node) => node.getBoundingClientRect().height)).toBe(16);
        await expect(grid).toHaveAttribute('inert', '');
        const code = method.locator('code');
        await expect(code).toHaveCount(1);
        await trigger.focus();
        await trigger.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(code).toBeVisible();
        expect(await grid.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(
          16,
        );
        await trigger.press('Space');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(trigger).toBeFocused();
        expect(await grid.evaluate((node) => node.getBoundingClientRect().height)).toBe(16);
        await expect(code).toHaveCount(1);
        await expect(grid).toHaveAttribute('inert', '');
        expect(
          await opened.page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      } finally {
        await opened.close();
      }
    }
});
