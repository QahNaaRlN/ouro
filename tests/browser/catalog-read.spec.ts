import { test, expect, type Page } from '@playwright/test';
import type { WorkspaceProjectDTO } from '../../packages/client/src/ports';
import type {} from '../../apps/web/tests/fixtures/catalog-probe';
import type {} from '../../apps/web/tests/fixtures/session-hook-probe';

const project = (name: string): WorkspaceProjectDTO => ({
  id: name,
  name,
  kind: 'demo',
  rootPath: null,
  createdAt: '2026-11-04T00:00:00.000Z',
  createdBy: null,
});
const open = async (page: Page) => {
  await page.goto('/tests/fixtures/catalog-probe.html');
  await expect.poll(() => page.evaluate(() => !!window.catalogProbe)).toBe(true);
};
const count = async (page: Page, value: number) =>
  expect.poll(() => page.evaluate(() => window.catalogProbe.pending().length)).toBe(value);

test('quality same-valued catalog scope rerender preserves the read owner and draft', async ({
  page,
}) => {
  await open(page);
  await count(page, 1);
  await page.evaluate(
    (value) => window.catalogProbe.resolve(0, [value]),
    project('Stable catalog'),
  );
  await expect(page.locator('output')).toHaveText('Stable catalog');
  await page.getByLabel('Несохранённый ввод').fill('Same owner');
  await page.evaluate(() =>
    window.catalogProbe.configure({ actorId: 'actor-A', accessEpoch: 1, hostEpoch: 1 }),
  );
  await expect(page.getByLabel('Несохранённый ввод')).toHaveValue('Same owner');
  await expect(page.locator('output')).toHaveText('Stable catalog');
  expect(await page.evaluate(() => window.catalogProbe.pending().length)).toBe(1);
  expect(await page.evaluate(() => window.catalogProbe.fetches())).toBe(0);
});

test('quality session hook keeps same-value ownership and isolates each primitive replacement', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/session-hook-probe.html');
  const metrics = () => page.evaluate(() => window.sessionHookProbe.metrics());
  await expect
    .poll(async () => {
      try {
        return (await metrics()).reads;
      } catch {
        return 0;
      }
    })
    .toBe(1);
  await page.evaluate(() => window.sessionHookProbe.resolve(0));
  await expect(page.getByTestId('snapshot-project')).toHaveText('project-A');
  await expect.poll(async () => (await metrics()).subscriptions).toBe(1);
  const first = await page.getByTestId('session-id').textContent();
  await page.getByLabel('Session draft').fill('Keep local input');
  await page.evaluate(() =>
    window.sessionHookProbe.configure({
      projectId: 'project-A',
      actorId: 'actor-A',
      accessEpoch: 1,
      hostEpoch: 1,
    }),
  );
  await expect(page.getByTestId('session-id')).toHaveText(first!);
  expect(await metrics()).toEqual({
    acquired: 1,
    released: 0,
    subscriptions: 1,
    closed: 0,
    reads: 1,
  });
  await page.evaluate(() => window.sessionHookProbe.refresh());
  await expect.poll(async () => (await metrics()).reads).toBe(2);
  await page.evaluate(() =>
    window.sessionHookProbe.configure({
      projectId: 'project-A',
      actorId: 'actor-B',
      accessEpoch: 1,
      hostEpoch: 1,
    }),
  );
  await expect.poll(async () => (await metrics()).reads).toBe(3);
  await page.evaluate(() => window.sessionHookProbe.resolve(1));
  await expect(page.getByTestId('snapshot-project')).toHaveText('-');
  await page.evaluate(() => window.sessionHookProbe.resolve(2));
  await expect(page.getByTestId('snapshot-project')).toHaveText('project-A');
  const scopes = [
    { projectId: 'project-A', actorId: 'actor-B', accessEpoch: 2, hostEpoch: 1 },
    { projectId: 'project-A', actorId: 'actor-B', accessEpoch: 2, hostEpoch: 2 },
    { projectId: 'project-B', actorId: 'actor-B', accessEpoch: 2, hostEpoch: 2 },
  ];
  for (const [index, scope] of scopes.entries()) {
    await page.evaluate((value) => window.sessionHookProbe.configure(value), scope);
    await expect.poll(async () => (await metrics()).reads).toBe(4 + index);
    await expect(page.getByTestId('snapshot-project')).toHaveText('-');
    await page.evaluate((value) => window.sessionHookProbe.resolve(value), 3 + index);
    await expect(page.getByTestId('snapshot-project')).toHaveText(scope.projectId);
  }
  await expect.poll(async () => (await metrics()).subscriptions).toBe(5);
  expect(await metrics()).toEqual({
    acquired: 5,
    released: 4,
    subscriptions: 5,
    closed: 4,
    reads: 6,
  });
  await expect(page.getByLabel('Session draft')).toHaveValue('Keep local input');
  await page.evaluate(() => window.sessionHookProbe.configure(undefined));
  await expect(page.getByTestId('session-id')).toHaveText('-');
  expect((await metrics()).closed).toBe(5);
});

test('CRP06 A/B/A source replacement keeps draft and rejects old ignored-abort data/cache', async ({
  page,
}) => {
  await open(page);
  await count(page, 1);
  await page.getByLabel('Несохранённый ввод').fill('Draft survives source replacement');
  await page.evaluate(() =>
    window.catalogProbe.configure({ sourceId: 'fixture:B', hostEpoch: 2, actorId: 'actor-B' }),
  );
  await count(page, 2);
  await page.evaluate((value) => window.catalogProbe.resolve(1, [value]), project('Current B'));
  await expect(page.locator('output')).toHaveText('Current B');
  await page.evaluate((value) => window.catalogProbe.resolve(0, [value]), project('FOREIGN A'));
  await expect(page.locator('output')).toHaveText('Current B');
  await page.evaluate(() =>
    window.catalogProbe.configure({ sourceId: 'fixture:A', hostEpoch: 3, actorId: 'actor-A' }),
  );
  await count(page, 3);
  await page.evaluate((value) => window.catalogProbe.resolve(2, [value]), project('Current A'));
  await expect(page.locator('output')).toHaveText('Current A');
  await expect(page.getByLabel('Несохранённый ввод')).toHaveValue(
    'Draft survives source replacement',
  );
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(window.catalogProbe.cache())))
    .not.toContain('Current B');
  expect(await page.evaluate(() => window.catalogProbe.fetches())).toBe(0);
});

test('CRP06 same actor reauthentication and host epoch cannot accept an earlier list', async ({
  page,
}) => {
  await open(page);
  await count(page, 1);
  await page.evaluate(() => window.catalogProbe.configure({ accessEpoch: 2 }));
  await count(page, 2);
  await page.evaluate(
    (value) => window.catalogProbe.resolve(1, [value]),
    project('Reauthenticated'),
  );
  await expect(page.locator('output')).toHaveText('Reauthenticated');
  await page.evaluate((value) => window.catalogProbe.resolve(0, [value]), project('OLD'));
  await page.evaluate(() => window.catalogProbe.configure({ hostEpoch: 2 }));
  await count(page, 3);
  await expect(page.locator('output')).toHaveText('');
  await page.evaluate(
    (value) => window.catalogProbe.resolve(2, [value]),
    project('New host epoch'),
  );
  await expect(page.locator('output')).toHaveText('New host epoch');
});

test('CRP06 disabled, unsupported and empty lists finish; old refresh cannot confirm a new scope', async ({
  page,
}) => {
  await open(page);
  await count(page, 1);
  await page.evaluate(() => window.catalogProbe.configure({ enabled: false }));
  await expect(page.getByRole('status', { name: 'Read state' })).toHaveText('idle');
  await page.evaluate(() => window.catalogProbe.configure({ enabled: true, unsupported: true }));
  await expect(page.getByRole('status', { name: 'Read state' })).toHaveText('unavailable');
  await page.evaluate(() => window.catalogProbe.configure({ unsupported: false, accessEpoch: 2 }));
  await count(page, 2);
  await page.evaluate(() => window.catalogProbe.resolve(1, []));
  await expect(page.getByRole('status', { name: 'Read state' })).toHaveText('ready');
  await page.getByRole('button', { name: 'Перечитать' }).click();
  await count(page, 3);
  await page.evaluate(() => window.catalogProbe.configure({ actorId: 'actor-B', accessEpoch: 3 }));
  await count(page, 4);
  await page.evaluate((value) => window.catalogProbe.resolve(3, [value]), project('Current owner'));
  await expect(page.locator('output')).toHaveText('Current owner');
  await page.evaluate((value) => window.catalogProbe.resolve(2, [value]), project('Old refresh'));
  await expect(page.getByTestId('admitted')).toHaveText('false');
  await expect(page.locator('output')).toHaveText('Current owner');
  expect(await page.evaluate(() => window.catalogProbe.fetches())).toBe(0);
});

test('CRP06 unsupported identity reader finishes current controller without ambient HTTP or signed-out fallback', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.catalogProbe.configure({ identity: true }));
  await expect(page.getByRole('status')).toHaveText('unavailable');
  expect(await page.evaluate(() => window.catalogProbe.fetches())).toBe(0);
});
