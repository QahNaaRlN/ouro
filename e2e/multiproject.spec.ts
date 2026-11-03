import {chooseSelectOption} from './select-helpers';
import { test, expect, request as apiRequest, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ProjectState } from '../packages/core/src';
import { multiprojectFixturePath, type MultiprojectFixture } from './multiproject-global-setup';

async function login(page: Page, input: { email: string; password: string }) {
  const response = await page.request.post('/api/auth/login', { data: input });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible({ timeout: 15000 });
}

async function acceptInvitation(page: Page, input: { name: string; password: string; code: string }) {
  const response = await page.request.post('/api/auth/invitations/accept', {
    data: { name: input.name, password: input.password, code: input.code },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible({ timeout: 15000 });
}

async function switchProject(page: Page, projectId: string) {
  await chooseSelectOption(page.getByLabel('Текущий проект', { exact: true }),projectId);
  await expect(page.getByRole('heading', { name: /^Дорожная карта/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Текущий проект', { exact: true })).toHaveAttribute('data-value',projectId);
}

async function createSpec(page: Page, title: string) {
  await page.getByRole('button', { name: 'Новая спека', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'Цель', exact: true }).fill('Проверить изолированную работу участника.');
  await dialog.getByRole('textbox', { name: /^Definition of Done/ }).fill('Событие записано в выбранный проект');
  await dialog.getByRole('button', { name: 'Создать спецификацию', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

async function projectState(page: Page, projectId: string) {
  const response = await page.request.get(`/api/project?projectId=${encodeURIComponent(projectId)}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).state as ProjectState;
}

async function accountPage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

test('MP01/MP04/AA04/AA05/AA06 projects, invitations, roles and logout work through real HTTP and UI', async ({ page, browser, baseURL }) => {
  test.setTimeout(120000);
  const fixture: MultiprojectFixture = JSON.parse(await readFile(multiprojectFixturePath, 'utf8'));
  const contributor = await accountPage(browser, baseURL!);
  const viewer = await accountPage(browser, baseURL!);
  try {
    await login(page, fixture.owner);
    const ownerProjects = (await (await page.request.get('/api/projects')).json()).projects as { id: string; name: string; role: string }[];
    expect(ownerProjects.filter(item => [fixture.first.id, fixture.second.id].includes(item.id)).map(item => item.id).sort()).toEqual([fixture.first.id, fixture.second.id].sort());
    expect(ownerProjects.find(item => item.id === fixture.first.id)?.role).toBe('Owner');

    const ownerFirstTitle = `Owner Alpha ${Date.now()}`;
    const ownerSecondTitle = `Owner Beta ${Date.now()}`;
    await switchProject(page, fixture.first.id);
    await createSpec(page, ownerFirstTitle);
    await switchProject(page, fixture.second.id);
    await createSpec(page, ownerSecondTitle);
    expect((await projectState(page, fixture.first.id)).version).toBe(1);
    expect((await projectState(page, fixture.second.id)).version).toBe(1);
    expect((await projectState(page, fixture.first.id)).specs.map(item => item.title)).toEqual([ownerFirstTitle]);
    expect((await projectState(page, fixture.second.id)).specs.map(item => item.title)).toEqual([ownerSecondTitle]);

    await acceptInvitation(contributor.page, fixture.contributor);
    const contributorProjects = (await (await contributor.page.request.get('/api/projects')).json()).projects as { id: string; role: string }[];
    expect(contributorProjects.map(item => item.id)).toEqual([fixture.first.id]);
    expect(contributorProjects[0].role).toBe('Contributor');
    expect((await contributor.page.request.get(`/api/project?projectId=${fixture.second.id}`)).status()).toBe(401);
    const contributorTitle = `Contributor Alpha ${Date.now()}`;
    await switchProject(contributor.page, fixture.first.id);
    await createSpec(contributor.page, contributorTitle);
    const afterContributor = await projectState(contributor.page, fixture.first.id);
    expect(afterContributor.version).toBe(2);
    const contributorSpec = afterContributor.specs.find(spec => spec.title === contributorTitle);
    expect(contributorSpec).toBeTruthy();
    expect(afterContributor.events.find(event => event.type === 'SpecCreated' && event.specId === contributorSpec!.id)?.actor.name).toBe(fixture.contributor.name);

    await acceptInvitation(viewer.page, fixture.viewer);
    await switchProject(viewer.page, fixture.first.id);
    await expect(viewer.page.getByText('Роль Viewer: проект доступен только для чтения.', { exact: true })).toBeVisible();
    await expect(viewer.page.getByRole('button', { name: 'Новая спека', exact: true })).toBeDisabled();
    const viewerProjects = (await (await viewer.page.request.get('/api/projects')).json()).projects as { id: string; role: string }[];
    expect(viewerProjects.map(item => item.id)).toEqual([fixture.first.id]);
    expect(viewerProjects[0].role).toBe('Viewer');
    expect((await viewer.page.request.get(`/api/project?projectId=${fixture.second.id}`)).status()).toBe(401);
    const denied = await viewer.page.request.post(`/api/commands?projectId=${fixture.first.id}`, { data: {
      type: 'createSpec', requestId: crypto.randomUUID(), expectedVersion: 2,
      content: { title: 'Viewer cannot write', goal: 'Denied', dod: [{ id: 'no', text: 'No event', required: true }], constraints: '', assumptions: '', risks: '', inputs: '', comment: '' },
    } });
    expect(denied.status()).toBe(403);
    expect((await projectState(viewer.page, fixture.first.id)).version).toBe(2);

    const session = (await viewer.context.cookies()).find(cookie => cookie.name === 'ouro_user_session')?.value;
    expect(session).toBeTruthy();
    const logout = viewer.page.waitForResponse(item => new URL(item.url()).pathname === '/api/auth/logout' && item.request().method() === 'POST');
    await viewer.page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).dispatchEvent('click');
    expect((await logout).ok()).toBeTruthy();
    await expect(viewer.page.getByText('Человек · локальная сессия', { exact: true })).toBeVisible({ timeout: 15000 });
    const local = await viewer.page.request.get('/api/session');
    expect(local.ok()).toBeTruthy();
    expect((await local.json()).actor.id).toBe('local-human');
    expect((await viewer.page.request.get('/api/auth/session')).status()).toBe(401);
    const captured = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { Cookie: `ouro_user_session=${session}` } });
    try { expect((await captured.get('/api/auth/session')).status()).toBe(401); }
    finally { await captured.dispose(); }
  } finally {
    await Promise.allSettled([contributor.context.close(), viewer.context.close()]);
  }
});
