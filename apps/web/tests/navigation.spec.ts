import { test, expect } from '@playwright/test';

test('VWS02 route navigation and browser history preserve a single document and workspace shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const documentId = await page.evaluate(() => {
    const marker = crypto.randomUUID();
    document.documentElement.dataset.navigationFixture = marker;
    return marker;
  });
  let sessionReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/session') sessionReads++; });
  await page.getByRole('navigation', { name: 'Навигация проектов' }).getByRole('link', { name: 'Подключить агента', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/help$/);
  await expect(page.getByRole('heading', { name: 'Подключить агента к Ouro', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-navigation-fixture', documentId);
  await page.goBack();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Подключить агента к Ouro', exact: true })).toBeVisible();
  expect(sessionReads, 'child-route navigation must retain its workspace provider').toBe(0);
  expect(errors).toEqual([]);
});

test('VWS02 all project routes open directly and legacy Human View remains separate', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const projectsResponse = await page.request.get('/api/projects');
  expect(projectsResponse.ok()).toBe(true);
  const { projects } = await projectsResponse.json() as { projects: { id: string; name: string }[] };
  expect(projects.length).toBeGreaterThan(0);
  const project = projects[0];
  await page.goto(`/projects/${encodeURIComponent(project.id)}`);
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.goto(`/projects/${encodeURIComponent(project.id)}/members`);
  await expect(page.locator('.ws-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Навигация проектов' })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.ws-shell')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Проекты', exact: true }).first()).toBeVisible();
});

test('VWS05 API and missing static assets do not receive successful SPA fallback', async ({ request }) => {
  for (const url of ['/api/does-not-exist', '/assets/does-not-exist.js', '/does-not-exist.svg', '/assets/does-not-exist.json', '/assets/does-not-exist.wasm', '/does-not-exist.mjs']) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(404);
  }
  const response = await request.get('/projects/help');
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('<div id="root"></div>');
});

test('VWS02 project query navigation preserves history identity through Back and Forward', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const { projects } = await (await page.request.get('/api/projects')).json() as { projects: { id: string }[] };
  await page.goto(`/projects/${encodeURIComponent(projects[0].id)}`);
  const navigation = page.getByRole('navigation', { name: 'Разделы проекта', exact: true });
  await navigation.getByRole('button', { name: /^История(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/view=history/);
  const historyKey = await page.evaluate(() => window.history.state?.__TSR_key as string | undefined);
  expect(typeof historyKey, 'each project query entry needs a persistent router history key').toBe('string');
  await navigation.getByRole('button', { name: /^Дорожная карта(?:\s|$)/ }).click();
  await expect(page).toHaveURL(/view=roadmap/);
  const roadmapKey = await page.evaluate(() => window.history.state?.__TSR_key as string | undefined);
  expect(roadmapKey).not.toBe(historyKey);
  await page.goBack();
  await expect(page).toHaveURL(/view=history/);
  await expect(navigation.getByRole('button', { name: /^История(?:\s|$)/ })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => window.history.state?.__TSR_key)).toBe(historyKey);
  await page.goForward();
  await expect(page).toHaveURL(/view=roadmap/);
  await expect(navigation.getByRole('button', { name: /^Дорожная карта(?:\s|$)/ })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => window.history.state?.__TSR_key)).toBe(roadmapKey);
});

test('VWS04 modified link clicks retain native new-tab behavior and help fragments remain anchors', async ({ page, context }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const opened = context.waitForEvent('page');
  await page.getByRole('navigation', { name: 'Навигация проектов' }).getByRole('link', { name: 'Подключить агента', exact: true }).click({ modifiers: ['ControlOrMeta'] });
  const popup = await opened;
  try {
    await expect(popup).toHaveURL(/\/projects\/help$/);
    await expect(popup.getByRole('heading', { name: 'Подключить агента к Ouro', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);
    await popup.getByRole('navigation', { name: 'Клиенты MCP' }).getByRole('link', { name: 'Cursor', exact: true }).click();
    await expect(popup).toHaveURL(/\/projects\/help#cursor$/);
    await expect(popup.locator('#cursor')).toBeInViewport();
  } finally { await popup.close(); }
});

test('VWS05 same-origin API proxy preserves cookie-clearing POST and refuses a forged Origin', async ({ page, baseURL }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const forged = await page.request.post('/api/participants/logout', { headers: { Origin: 'https://forged.invalid' }, data: {} });
  expect(forged.status()).toBe(403);
  const response = await page.request.post('/api/participants/logout', { headers: { Origin: baseURL! }, data: {} });
  expect(response.status(), await response.text()).toBe(200);
  const cookies = response.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie').map(header => header.value);
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) expect(cookie).toMatch(/HttpOnly; SameSite=Strict; Path=\/; Max-Age=0/);
  expect(response.headers()['cache-control']).toBe('no-store');
});
