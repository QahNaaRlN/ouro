import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Открывает раздел Human View через реальную desktop/mobile-навигацию. */
async function navigate(page: Page, name: string) {
  const item = page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') });
  if (await item.evaluate((element) => element.getBoundingClientRect().right <= 0))
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await item.click();
}

/** Снимает одно сохранённое demo-состояние без команд, credentials и подмены серверного времени. */
test('TWH01 Human View presentation retains both themes, responsive layouts and modal focus', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const output = resolve(process.env.OURO_TAILWIND_VISUAL_DIR ?? testInfo.outputPath('visual'));
  await mkdir(output, { recursive: true });
  const metrics: Record<string, unknown> = {};
  for (const theme of ['dark', 'light'])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator('footer')).toContainText('Живые обновления подключены');
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему',
            exact: true,
          })
          .click();
      await page.evaluate(() => document.fonts.ready);
      const capture = async (view: string) => {
        await page.mouse.move(0, 0);
        const key = `${theme}-${width}-${view}`;
        metrics[key] = await page.locator('.app-shell').evaluate((root) =>
          Array.from(
            root.querySelectorAll(
              '.sidebar,.brand,.nav-item,.topbar,.main-content,.context-panel,.statusbar,.page-heading,.overview-metrics,.canvas-toolbar,.toolbar-right,.segmented,.search-field,.table-surface,.table-wrap,.selection-strip,.spec-title-row,.detail-tabs,.content-section,.criterion,.decision-layout,.decision-row,.history-toolbar,.timeline-item,.comparison-view,.comparison-heading,.modal,.modal-header,.modal-form,.form-label,.modal-actions,.methodology-intro,.methodology-articles',
            ),
          ).map((element) => {
            const style = getComputedStyle(element),
              box = element.getBoundingClientRect();
            return {
              hook: element.classList[0],
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              display: style.display,
              padding: style.padding,
              margin: style.margin,
              gap: style.gap,
              color: style.color,
              background: style.backgroundColor,
              font: style.font,
              border: style.border,
              borderRadius: style.borderRadius,
            };
          }),
        );
        await page.screenshot({
          path: join(output, `${key}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      };
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
      await capture('roadmap-graph');
      await page.getByRole('button', { name: 'Таблица', exact: true }).click();
      await expect(page.locator('.table-surface')).toBeVisible();
      await capture('roadmap-table');
      await page.getByRole('button', { name: 'Новая спека', exact: true }).click();
      const create = page.getByRole('dialog', { name: 'Новая спецификация', exact: true });
      await expect(create).toBeVisible();
      await create
        .getByRole('textbox', { name: 'Название', exact: true })
        .fill('Неотправленное ожидание Tailwind');
      await expect(create.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused();
      await capture('create-form');
      await page.keyboard.press('Escape');
      await expect(create).not.toBeVisible();
      await navigate(page, 'Спецификации');
      await expect(page.getByRole('heading', { name: 'Спецификация', exact: true })).toBeVisible();
      await capture('expectation');
      for (const [tab, view] of [
        ['Сопоставление', 'comparison'],
        ['Реальность', 'reality'],
        ['Ревизии', 'revisions'],
      ] as const) {
        await page.getByRole('button', { name: new RegExp('^' + tab + '(?:\\s|$)') }).click();
        await capture(view);
      }
      await page.getByRole('button', { name: 'Ожидание', exact: true }).click();
      await page.getByRole('button', { name: 'Предложить ревизию', exact: true }).click();
      const revision = page.getByRole('dialog', { name: 'Предложить новую ревизию', exact: true });
      await expect(revision).toBeVisible();
      await capture('revision-form');
      await page.keyboard.press('Escape');
      await expect(revision).not.toBeVisible();
      await navigate(page, 'Решения');
      await expect(page.getByRole('heading', { name: /^Решения(?:\s|$)/ })).toBeVisible();
      await capture('decisions');
      await navigate(page, 'История');
      await expect(page.locator('.timeline-item').first()).toBeVisible();
      await capture('history');
      await navigate(page, 'Методология и источники');
      await expect(
        page.getByRole('heading', { name: 'Методология и источники', exact: true }),
      ).toBeVisible();
      await capture('methodology');
    }
  await writeFile(join(output, 'presentation.json'), JSON.stringify(metrics, null, 2));
});
