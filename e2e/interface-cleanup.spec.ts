import {test,expect} from '@playwright/test';

test('IC01 Human View keeps the actual session readable and opens projects from its breadcrumb by keyboard',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
  const response=await page.request.get('/api/session');
  expect(response.ok()).toBeTruthy();
  const {actor}=await response.json() as {actor:{name:string}};
  const session=page.getByRole('status',{name:'Текущая сессия',exact:true});
  await expect(session).toContainText(actor.name);
  await expect(session).toContainText('Локальный оператор');

  const projects=page.locator('header.topbar').getByRole('link',{name:'Проекты',exact:true});
  await expect(projects).toHaveAttribute('href','/projects');
  await projects.focus();
  await expect(projects).toBeFocused();
  await projects.press('Enter');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading',{name:'Проекты',exact:true})).toBeVisible();
});
