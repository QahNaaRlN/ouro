import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chooseSelectOption } from './select-helpers';
import { verificationPresentationFixture } from './verification-presentation-fixture';

/** Раскрывает настоящий accordion; production state, часы и генератор ID не подменяются. */
async function reveal(control: Locator) {
  await control.waitFor({ state: 'attached' });
  const accordion = control
    .locator(
      'xpath=ancestor::section[contains(concat(" ",normalize-space(@class)," ")," ws-accordion ")]',
    )
    .last();
  if (await accordion.count()) {
    const button = accordion.locator(':scope > button[aria-expanded]');
    if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  }
  await expect(control).toBeVisible();
}

test('TWV01 paired faces, saved contract, provenance and statuses preserve their actual surfaces', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(480000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const login = await page.request.get('/api/session');
  expect(login.ok(), await login.text()).toBe(true);
  const fixture = await verificationPresentationFixture(page, baseURL!),
    output = resolve(process.env.OURO_VERIFICATION_VISUAL_DIR ?? testInfo.outputPath('visual'));
  await mkdir(output, { recursive: true });
  const metrics: Record<string, unknown> = {};
  const state = async () => {
    const response = await page.request.get(`/api/projects/${fixture.projectId}`);
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).state;
  };
  expect(await state()).toEqual(fixture.state);
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
      const capture = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          return new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        const key = `${theme}-${width}-${name}`;
        metrics[key] = await page
          .locator('.verification-pair,.verification-panel,.work-status')
          .evaluateAll((roots) =>
            roots
              .filter((root) => !roots.some((parent) => parent !== root && parent.contains(root)))
              .flatMap((root) =>
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
                    transform: s.transform,
                    perspective: s.perspective,
                    backfaceVisibility: s.backfaceVisibility,
                    transition: s.transition,
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
      if (process.env.OURO_VERIFICATION_VISUAL_SCOPE === 'pair-variants') {
        await page.goto(`/projects/${fixture.projectId}?view=roadmap&spec=${fixture.workId}`);
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        const pair = page.locator(
          `.react-flow__node .verification-pair[data-pair-id="${fixture.workId}"]`,
        );
        await expect(pair).toBeVisible();
        await expect(
          pair.locator(
            'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," spec-node ")]',
          ),
        ).toHaveClass(/is-selected/);
        await capture('selected-verification');
        await pair.getByRole('button', { name: 'Работа', exact: true }).click();
        await capture('selected-work');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const rotor = pair.locator('.verification-rotor');
        await expect
          .poll(() => rotor.evaluate((node) => getComputedStyle(node).transitionDuration))
          .toBe('0.7s');
        await pair.getByRole('button', { name: 'Проверка', exact: true }).click();
        await expect
          .poll(() =>
            rotor.evaluate((node) => {
              const matrix = new DOMMatrix(getComputedStyle(node).transform);
              return (
                Math.abs(matrix.m11 + 1) < 1e-6 &&
                Math.abs(matrix.m13) < 1e-6 &&
                Math.abs(matrix.m33 + 1) < 1e-6
              );
            }),
          )
          .toBe(true);
        await capture('selected-normal-motion');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        continue;
      }
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
      const project = page.getByLabel('Текущий проект', { exact: true });
      if ((await project.getAttribute('data-value')) !== fixture.projectId) {
        await chooseSelectOption(project, fixture.projectId);
        await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
      }
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему',
            exact: true,
          })
          .click();
      const legacyPair = page.locator(
        `.react-flow__node .verification-pair[data-pair-id="${fixture.workId}"]`,
      );
      await expect(legacyPair).toBeVisible();
      await capture('legacy-graph');
      await legacyPair.getByRole('button', { name: 'Работа', exact: true }).click();
      await capture('legacy-work');
      await legacyPair.getByRole('button', { name: 'Проверка', exact: true }).focus();
      await page.keyboard.press('Enter');
      await capture('legacy-verification');
      await legacyPair.getByRole('button', { name: 'К записанной фазе', exact: true }).click();
      await navigate('История');
      await page
        .getByRole('spinbutton', { name: 'Исторический cursor', exact: true })
        .fill(String(fixture.state.version));
      await page.getByRole('button', { name: 'Открыть состояние на cursor', exact: true }).click();
      const historical = page.getByRole('region', { name: 'Историческое состояние', exact: true });
      await chooseSelectOption(
        historical.getByLabel('Спецификация в историческом состоянии', { exact: true }),
        fixture.verificationId,
      );
      const readOnly = historical.getByRole('region', {
        name: 'Проверка и результаты',
        exact: true,
      });
      await expect(readOnly).toBeVisible();
      await capture('legacy-readonly-results');
      await readOnly
        .getByRole('button', { name: 'Наблюдаемые входы и происхождение', exact: true })
        .click();
      await capture('legacy-readonly-observation');
      await historical
        .getByRole('button', { name: 'Вернуться к текущей работе', exact: true })
        .click();
      await page.goto(`/projects/${fixture.projectId}`);
      await expect(page.getByLabel('Граф спецификаций проекта', { exact: true })).toBeVisible();
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      const graphPair = page.locator(
        `.react-flow__node .verification-pair[data-pair-id="${fixture.workId}"]`,
      );
      await expect(graphPair).toBeVisible();
      await capture('workspace-graph');
      await graphPair.getByRole('button', { name: 'Работа', exact: true }).click();
      await capture('workspace-work');
      await graphPair.getByRole('button', { name: 'Проверка', exact: true }).click();
      await capture('workspace-verification');
      await page.getByRole('button', { name: 'Список', exact: true }).click();
      const tablePair = page
        .getByRole('region', { name: 'Список спецификаций', exact: true })
        .locator(`.verification-pair[data-pair-id="${fixture.workId}"]`);
      await expect(tablePair).toBeVisible();
      await capture('workspace-table');
      await tablePair.getByRole('button', { name: 'Работа', exact: true }).click();
      await capture('workspace-table-work');
      const open = async () => {
        await page.goto(
          `/projects/${fixture.projectId}?view=spec&spec=${fixture.verificationId}&revision=${fixture.verificationRevisionId}&execution=all`,
        );
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        const panel = page.getByRole('region', { name: 'Проверка и результаты', exact: true });
        await expect(panel).toBeVisible();
        return panel;
      };
      let panel = await open();
      await capture('results');
      for (const [name, trigger] of [
        ['contract', 'Изменить проверочный контракт'],
        ['slice', 'Указать текущий проверяемый срез'],
        ['import', 'Импортировать результат Playwright'],
        ['phase', 'Записать фактическую фазу вне цикла'],
        ['cycles', 'Циклы работы и проверки · 1'],
        ['refactor', 'Рассмотрение рефакторинга тестов'],
        ['manual', 'Записать ручную проверку'],
        ['observations', 'Наблюдаемые входы и происхождение'],
      ] as const) {
        panel = await open();
        const button = panel.getByRole('button', { name: trigger, exact: true });
        await button.click();
        if (name === 'contract') {
          await expect(panel.locator('fieldset.verification-case').first()).toContainText(
            'automated-case',
          );
          await expect(panel.locator('fieldset.verification-case').nth(1)).toContainText(
            'manual-case',
          );
        }
        if (name === 'import') {
          await panel.getByLabel('Начало прогона', { exact: true }).fill('2026-11-03T10:00');
          await panel.getByLabel('Окончание прогона', { exact: true }).fill('2026-11-03T10:01');
        }
        if (name === 'manual') {
          await panel
            .getByLabel('Начало ручной проверки', { exact: true })
            .fill('2026-11-03T10:00');
          await panel
            .getByLabel('Окончание ручной проверки', { exact: true })
            .fill('2026-11-03T10:01');
          await panel
            .getByRole('checkbox', { name: 'Добавить mutation-результаты', exact: true })
            .check();
        }
        if (name === 'observations') {
          const history = panel.getByRole('button', { name: /^История наблюдений · / });
          await history.click();
          await expect(
            panel.getByRole('table', { name: 'Манифест входов', exact: true }).first(),
          ).toBeVisible();
        }
        await capture(`form-${name}`);
      }
      panel = await open();
      const latest = panel.locator('.verification-run').first();
      await reveal(
        latest.getByRole('button', {
          name: 'Записать заключение',
          exact: true,
          includeHidden: true,
        }),
      );
      await capture('run-review');
      const runner = panel
        .locator('.verification-run')
        .filter({ hasText: 'Подтверждённый локальный раннер' });
      await runner.getByRole('button', { name: 'Манифест входов прогона', exact: true }).click();
      await capture('run-manifest');
      const imported = panel
        .locator('.verification-run')
        .filter({ hasText: 'Импортированный Playwright JSON' });
      await imported.getByRole('button', { name: 'Исходный отчёт', exact: true }).click();
      await capture('run-raw-report');
      for (const [tone, specId] of Object.entries(fixture.statusSpecs)) {
        await page.goto(`/projects/${fixture.projectId}?view=spec&spec=${specId}`);
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        await expect(
          page.getByRole('region', { name: 'Выбранная задача', exact: true }),
        ).toBeVisible();
        await capture(`status-${tone}`);
      }
    }
  expect(await state()).toEqual(fixture.state);
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
  await writeFile(
    join(output, 'qualification.json'),
    JSON.stringify(
      {
        projectId: fixture.projectId,
        cursor: fixture.state.version,
        dataDir: process.env.OURO_E2E_DATA_DIR,
        pathDigest:
          fixture.state.verificationObservations.at(-1)?.observation.capabilities.pathDigest,
      },
      null,
      2,
    ),
  );
});
