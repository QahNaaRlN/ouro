import { test, expect } from '@playwright/test';
import type {
  ClientErrorOccurrence,
  FrozenProjectCommandIntent,
} from '../../packages/client/src/ports';
import type { WorkspaceIntent } from '../../packages/client/src/http/workspace-intents';

declare global {
  interface Window {
    clientErrorProbe: {
      events: () => ClientErrorOccurrence[];
      retained: () => unknown;
      warningOwners: () => number[];
      original: () => FrozenProjectCommandIntent | undefined;
      pending: () => WorkspaceIntent[];
      lease: () => { active: boolean | undefined; releases: number };
    };
  }
}
const fixture = '/tests/fixtures/client-error-probe.html';

test('render failure shows a neutral accessible fallback while retaining the parent Query runtime', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture);
  await expect(page.getByRole('heading', { name: 'Проверка ошибок клиента' })).toBeVisible();
  await page.getByRole('button', { name: 'Ошибка рендера', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось показать раздел');
  await expect(page.getByRole('alert')).toContainText('UNEXPECTED_ERROR');
  expect(await page.locator('body').textContent()).not.toContain('SECRET');
  expect(
    await page
      .getByRole('alert')
      .locator('code')
      .evaluate((node) => getComputedStyle(node).fontFamily),
  ).toContain('JetBrains Mono');
  expect(
    await page
      .getByRole('alert')
      .locator('code')
      .evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe('11px');
  const result = await page.evaluate(() => ({
    events: window.clientErrorProbe.events(),
    retained: window.clientErrorProbe.retained(),
  }));
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    kind: 'unexpected',
    operation: 'render-ui',
    severity: 'error',
  });
  expect(result.events[0]).not.toHaveProperty('accessEpoch');
  expect(JSON.stringify(result.events)).not.toContain('SECRET');
  expect(result.retained).toBe('original-owner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('render-fallback.png'), fullPage: true });
});

test('the shared reporter recognizes one occurrence propagated from Query to render', async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Query и renderer', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const result = await page.evaluate(() => ({
    events: window.clientErrorProbe.events(),
    retained: window.clientErrorProbe.retained(),
  }));
  expect(result.events).toHaveLength(1);
  expect(result.events[0].operation).toBe('query');
  expect(JSON.stringify(result.events)).not.toContain('SECRET');
  expect(result.retained).toBe('original-owner');
});

test('a real catalog async contract failure stays operation-owned and does not enter the render boundary', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'SECRET invalid JSON' }),
  );
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Ошибка async чтения', exact: true }).click();
  await expect(page.locator('output')).toHaveText('CATALOG_CONTRACT');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Проверка ошибок клиента' })).toBeVisible();
  const events = await page.evaluate(() => window.clientErrorProbe.events());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    operation: 'read-identity-session',
    code: 'CATALOG_CONTRACT',
    accessEpoch: 4,
  });
  expect(JSON.stringify(events)).not.toContain('SECRET');
});

test('child render cleanup preserves exact RAM UNKNOWN intent and the parent unload warning without another POST', async ({
  page,
}) => {
  const posts: Array<{
    body: Buffer | null;
    actor: string | undefined;
    project: string | undefined;
  }> = [];
  await page.route('**/api/projects/boundary-fake-project/commands', async (route) => {
    const request = route.request();
    posts.push({
      body: request.postDataBuffer(),
      actor: request.headers()['x-ouro-expected-participant'],
      project: request.headers()['x-ouro-expected-project'],
    });
    await route.abort('failed');
  });
  await page.goto(fixture);
  await expect
    .poll(() => page.evaluate(() => window.clientErrorProbe.warningOwners().length))
    .toBe(1);
  const owners = await page.evaluate(() => window.clientErrorProbe.warningOwners());
  await page.getByRole('button', { name: 'Создать UNKNOWN fixture', exact: true }).click();
  await expect(page.locator('output')).toHaveText('unknown');
  const before = await page.evaluate(() => ({
    intent: window.clientErrorProbe.original()!,
    pending: window.clientErrorProbe.pending(),
    lease: window.clientErrorProbe.lease(),
  }));
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual(Buffer.from(before.intent.body, 'utf8'));
  expect(posts[0].actor).toBe(before.intent.scope.actorId);
  expect(posts[0].project).toBe(before.intent.scope.projectId);
  expect(before.lease).toEqual({ active: true, releases: 0 });
  expect(before.pending).toHaveLength(1);
  expect(before.pending[0]).toMatchObject({
    status: 'unknown',
    uncertain: true,
    body: before.intent.body,
    requestId: before.intent.requestId,
    expectedVersion: before.intent.expectedVersion,
    actorId: before.intent.scope.actorId,
    projectId: before.intent.scope.projectId,
  });
  await page.getByRole('button', { name: 'Ошибка рендера', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.clientErrorProbe.lease()))
    .toEqual({ active: false, releases: 1 });
  const after = await page.evaluate(() => {
    const warning = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(warning);
    return {
      intent: window.clientErrorProbe.original(),
      pending: window.clientErrorProbe.pending(),
      owners: window.clientErrorProbe.warningOwners(),
      warned: warning.defaultPrevented,
    };
  });
  expect(after.intent).toEqual(before.intent);
  expect(after.pending).toEqual(before.pending);
  expect(after.owners).toEqual(owners);
  expect(after.warned).toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(posts).toHaveLength(1);
});
