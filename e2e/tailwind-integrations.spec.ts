import { test, expect, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { integrationVisualFixture } from './integration-visual-fixture';
import { chooseSelectOption } from './select-helpers';
import { getMeridianThemeVariables } from '../packages/meridian/src/theme';

/** Снимает видимые slots и native controls без привязки к новым utility class names. */
async function metrics(target: Locator) {
  return target.evaluate((root) => {
    const nodes = [
      root,
      ...root.querySelectorAll(
        'h1,h2,h3,h4,p,button,input,textarea,label,form,dt,dd,section,article,legend,[class*="meridian-"],[class*="github-"],[class*="onboarding-"]',
      ),
    ];
    return nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const css = getComputedStyle(node),
          box = node.getBoundingClientRect();
        const read = (style: CSSStyleDeclaration) => ({
          padding: style.padding,
          margin: style.margin,
          border: style.border,
          borderRadius: style.borderRadius,
          color: style.color,
          background: style.backgroundColor,
          font: style.font,
          display: style.display,
          gap: style.gap,
          outline: style.outline,
        });
        return {
          tag: node.tagName,
          slot: (node.getAttribute('class') ?? '')
            .split(' ')
            .filter((value) =>
              /^(meridian-|github-|onboarding-|integration-source|delivery-)/.test(value),
            )
            .join(' '),
          width: box.width,
          height: box.height,
          ...read(css),
          ...(node.matches('input[type=file]')
            ? { fileButton: read(getComputedStyle(node, '::file-selector-button')) }
            : {}),
        };
      });
  });
}

test('TI01 Meridian, GitHub and onboarding preserve deterministic themed responsive presentation and drafts', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(240000);
  expect(baseURL).toBeTruthy();
  const fixture = await integrationVisualFixture(page, baseURL!),
    raw = await readFile('tests/fixtures/meridian/scope.json', 'utf8');
  const output = process.env.OURO_INTEGRATION_VISUAL_DIR
    ? resolve(process.env.OURO_INTEGRATION_VISUAL_DIR)
    : testInfo.outputPath('visual');
  await mkdir(output, { recursive: true });
  let scenario: 'github' | 'meridian' = 'github';
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/session')
      return json({
        actor: fixture.actor,
        account: null,
        canManageParticipants: fixture.canManageParticipants,
      });
    if (path === '/api/project') {
      const state = fixture[scenario];
      return json({ state, cursor: state.version, storage: 'embedded-postgres' });
    }
    if (path === '/api/github') return json(fixture.info);
    if (request.method() !== 'GET')
      throw new Error('Visual navigation не должна отправлять domain mutation: ' + path);
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.removeItem('ouro:onboarding:catalog:v1');
    localStorage.removeItem('ouro:onboarding:project:v1');
    /** Фиксирует connecting только для снимков; реальные streams квалифицируются отдельными functional tests. */
    class VisualEventSource extends EventTarget {
      readyState = 0;
      onopen: ((event: Event) => unknown) | null = null;
      onerror: ((event: Event) => unknown) | null = null;
      constructor(_url: string) {
        super();
      }
      close() {
        this.readyState = 2;
      }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: VisualEventSource });
  });
  const measured: Record<string, Awaited<ReturnType<typeof metrics>>> = {};
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  };
  const capture = async (name: string, target?: Locator) => {
    await settle();
    if (target) {
      await target.scrollIntoViewIfNeeded();
      await settle();
      measured[name] = await metrics(target);
      await target.screenshot({
        path: join(output, name + '.png'),
        animations: 'disabled',
        caret: 'hide',
      });
    } else {
      const dialog = page.getByRole('dialog');
      measured[name] = await metrics(dialog);
      await page.screenshot({
        path: join(output, name + '.png'),
        animations: 'disabled',
        caret: 'hide',
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  };
  const navigateLegacy = async (name: string) => {
    const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
    if (
      (await menu.isVisible()) &&
      !(await page.locator('.sidebar').evaluate((node) => node.classList.contains('mobile-open')))
    )
      await menu.click({ timeout: 10000 });
    await page
      .getByRole('navigation', { name: 'Основная навигация', exact: true })
      .getByRole('button', { name, exact: true })
      .click({ timeout: 10000 });
  };
  const openRoot = async (theme: 'dark' | 'light') => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible();
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page
        .getByRole('button', {
          name: theme === 'light' ? 'Включить светлую тему' : 'Включить тёмную тему',
          exact: true,
        })
        .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  };
  const openLegacy = async (theme: 'dark' | 'light') => {
    await openRoot(theme);
    await navigateLegacy('Интеграции');
  };
  const meridian = () =>
    page.getByRole('region', { name: 'Импорт контекста Meridian', exact: true });
  const tour = () => page.getByRole('dialog');
  const launch = () => page.getByRole('button', { name: 'Обучение', exact: true });
  const workspaceTheme = async (theme: 'dark' | 'light') => {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
  };
  const before = await (await page.request.get('/api/projects/' + fixture.workspace.id)).json();
  for (const theme of ['dark', 'light'] as const)
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const prefix = theme + '-' + viewport.width;
      scenario = 'github';
      await openLegacy(theme);
      const form = page.getByRole('region', {
        name: 'Привязать репозиторий к попытке',
        exact: true,
      });
      await expect(form).toBeVisible();
      await chooseSelectOption(
        form.getByRole('combobox', { name: 'Попытка исполнения', exact: true }),
        fixture.github.executions[0].id,
      );
      await expect(page.getByRole('textbox', { name: 'Webhook URL', exact: true })).toHaveValue(
        fixture.info.setup.webhookUrl,
      );
      await form
        .getByRole('textbox', { name: 'Репозиторий', exact: true })
        .fill('review/saved-draft');
      await form
        .getByRole('textbox', { name: 'Ветка GitHub', exact: true })
        .fill('refs/heads/saved');
      for (const [name, label] of [
        ['github-setup', 'Настройка GitHub'],
        ['github-form', 'Привязать репозиторий к попытке'],
        ['github-bindings', 'Привязки GitHub'],
        ['github-deliveries', 'Доставки GitHub'],
        ['github-commits', 'Проверенные коммиты'],
      ])
        await capture(prefix + '-' + name, page.getByRole('region', { name: label, exact: true }));
      await capture(
        prefix + '-source-switch',
        page.getByRole('group', { name: 'Источник интеграции', exact: true }),
      );
      scenario = 'meridian';
      await openLegacy(theme);
      await page.getByRole('button', { name: 'Meridian', exact: true }).click();
      await expect(meridian()).toBeVisible();
      const expectedPalette = getMeridianThemeVariables(theme),
        keys = Object.keys(expectedPalette);
      expect(
        await meridian().evaluate(
          (node, fields) =>
            Object.fromEntries(
              fields.map((key) => [key, getComputedStyle(node).getPropertyValue(key).trim()]),
            ),
          keys,
        ),
      ).toEqual(expectedPalette);
      await page.evaluate(
        (value) => {
          document.documentElement.dataset.theme = value;
        },
        theme === 'dark' ? 'light' : 'dark',
      );
      expect(
        await meridian().evaluate(
          (node, fields) =>
            Object.fromEntries(
              fields.map((key) => [key, getComputedStyle(node).getPropertyValue(key).trim()]),
            ),
          keys,
        ),
      ).toEqual(expectedPalette);
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await capture(prefix + '-meridian-empty', meridian());
      await meridian()
        .getByLabel('JSON контекста Meridian', { exact: true })
        .setInputFiles({
          name: 'scope.json',
          mimeType: 'application/json',
          buffer: Buffer.from(raw),
        });
      const preview = meridian().getByRole('region', {
        name: 'Предпросмотр Meridian',
        exact: true,
      });
      await expect(preview).toBeVisible();
      await preview
        .getByRole('button', { name: 'Источники, границы и незакрытые вопросы', exact: true })
        .click();
      await capture(prefix + '-meridian-preview', preview);
      await meridian()
        .getByRole('textbox', { name: 'Название черновика', exact: true })
        .fill('Неотправленный черновик Meridian');
      await meridian()
        .getByRole('textbox', { name: 'Цель черновика', exact: true })
        .fill('Сохранить ожидание и внешний вид без активации.');
      await page.getByRole('button', { name: 'GitHub', exact: true }).click();
      const secondary = page.getByRole('region', {
        name: 'Привязать репозиторий к попытке',
        exact: true,
      });
      await secondary
        .getByRole('textbox', { name: 'Репозиторий', exact: true })
        .fill('review/retained');
      await secondary
        .getByRole('textbox', { name: 'Ветка GitHub', exact: true })
        .fill('refs/heads/retained');
      await page.getByRole('button', { name: 'Meridian', exact: true }).click();
      await expect(
        meridian().getByRole('textbox', { name: 'Название черновика', exact: true }),
      ).toHaveValue('Неотправленный черновик Meridian');
      await page.getByRole('button', { name: 'GitHub', exact: true }).click();
      await expect(
        secondary.getByRole('textbox', { name: 'Репозиторий', exact: true }),
      ).toHaveValue('review/retained');
      await page.getByRole('button', { name: 'Meridian', exact: true }).click();
      await capture(prefix + '-meridian-draft', meridian().locator('.meridian-form'));
      await openRoot(theme);
      await navigateLegacy('Спецификации');
      await chooseSelectOption(
        page.getByLabel('Выбрать спецификацию', { exact: true }),
        fixture.meridianSpecId,
      );
      const origin = page.getByRole('region', { name: 'Происхождение Meridian', exact: true });
      await expect(origin).toBeVisible();
      await origin
        .getByRole('button', { name: 'Неизменяемые pins и исходный документ', exact: true })
        .click();
      await capture(prefix + '-meridian-origin', origin);
      await openLegacy(theme);
      await page.getByRole('button', { name: 'Meridian', exact: true }).click();
      const invalid = JSON.parse(raw) as Record<string, unknown>;
      invalid.actions_authorized = true;
      await meridian()
        .getByLabel('JSON контекста Meridian', { exact: true })
        .setInputFiles({
          name: 'invalid-scope.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(invalid)),
        });
      await expect(meridian().getByRole('alert')).toBeVisible();
      await capture(prefix + '-meridian-error', meridian());
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
      await workspaceTheme(theme);
      await expect(
        page.getByRole('link').filter({
          has: page.getByRole('heading', { name: fixture.workspace.name, exact: true }),
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Знакомство с Ouro', exact: true }),
      ).toBeVisible();
      await capture(prefix + '-onboarding-invitation', page.locator('.onboarding-entry'));
      await launch().focus();
      await page.keyboard.press('Enter');
      await expect(tour().locator('[data-onboarding-highlight]')).toBeVisible();
      await expect(tour().getByRole('heading')).toBeFocused();
      expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
      await capture(prefix + '-onboarding-catalog');
      await page.keyboard.press('Escape');
      await expect(tour()).toHaveCount(0);
      await expect(launch()).toBeFocused();
      expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe(
        'hidden',
      );
      await page.goto('/projects/' + fixture.workspace.id);
      await expect(
        page.getByRole('heading', { name: fixture.workspace.name, exact: true }),
      ).toBeVisible();
      await workspaceTheme(theme);
      await page.getByRole('button', { name: 'Список', exact: true }).click();
      await launch().focus();
      await page.keyboard.press('Enter');
      await expect(tour().locator('[data-onboarding-highlight]')).toBeVisible();
      await capture(prefix + '-onboarding-project');
      await page.keyboard.press('Escape');
      await page.goto('/projects');
      await expect(launch()).toBeVisible();
      await workspaceTheme(theme);
      await expect(
        page.getByRole('link').filter({
          has: page.getByRole('heading', { name: fixture.workspace.name, exact: true }),
        }),
      ).toBeVisible();
      await page
        .locator('[data-onboarding="folder-input"]')
        .evaluate((node) => node.removeAttribute('data-onboarding'));
      await launch().focus();
      await page.keyboard.press('Enter');
      await expect(tour().getByRole('status')).toContainText('Элемент сейчас недоступен');
      await capture(prefix + '-onboarding-missing');
      await page.keyboard.press('Escape');
    }
  const after = await (await page.request.get('/api/projects/' + fixture.workspace.id)).json();
  expect(after.cursor).toBe(before.cursor);
  expect(after.state).toEqual(before.state);
  await writeFile(join(output, 'presentation.json'), JSON.stringify(measured, null, 2));
});
