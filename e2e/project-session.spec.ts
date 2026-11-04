import {test,expect} from '@playwright/test';

test('P12 same-actor retry opens a fresh project session after a denied bootstrap without reloading the page',async({page})=>{
 const identity=await(await page.request.get('/api/session')).json() as {actor:{id:string}};
 let reads=0;
 await page.route(url=>url.pathname==='/api/project',async route=>{if(++reads===1){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'FORBIDDEN',message:'Synthetic stale access scope'}})});return;}await route.continue();});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Проект недоступен',exact:true})).toBeVisible();
 const marker=await page.evaluate(()=>{const value=crypto.randomUUID();(window as Window&{__projectSessionMarker?:string}).__projectSessionMarker=value;return value;});
 const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/session');
 await page.getByRole('button',{name:'Повторить',exact:true}).click();
 expect((await(await refreshed).json()).actor.id).toBe(identity.actor.id);
 await expect(page.getByRole('heading',{name:/^Дорожная карта/})).toBeVisible();
 expect(await page.evaluate(()=>(window as Window&{__projectSessionMarker?:string}).__projectSessionMarker)).toBe(marker);
 expect(reads).toBe(2);
});
