import {expect,type Locator} from '@playwright/test';

type SelectOption=string|{label:string}|{index:number};

/** Exercise the visible Base UI popup rather than its hidden form control. */
export async function selectPopup(trigger:Locator){
  // Searchable controls also name their popup and search field. Keep a legacy
  // getByLabel locator attached to the actual trigger after the popup opens.
  trigger=trigger.and(trigger.page().locator('[data-base-ui-select]'));
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded','true');
  await expect(trigger).toHaveAttribute('aria-controls',/\S+/);
  const popupId=await trigger.getAttribute('aria-controls');
  expect(popupId,'The open combobox identifies its listbox').toBeTruthy();
  const popup=trigger.page().locator(`[id=${JSON.stringify(popupId)}]`);
  await expect(popup).toBeVisible();
  return popup;
}

export async function chooseSelectOption(trigger:Locator,selection:SelectOption){
  const popup=await selectPopup(trigger);
  const option=typeof selection==='string'
    ?popup.locator(`[role="option"][data-value=${JSON.stringify(selection)}]`)
    :'label'in selection?popup.getByRole('option',{name:selection.label,exact:true})
    :popup.getByRole('option').nth(selection.index);
  await expect(option).toBeVisible();
  await expect(option).toBeEnabled();
  await option.click();
  await expect(popup).not.toBeVisible();
}
