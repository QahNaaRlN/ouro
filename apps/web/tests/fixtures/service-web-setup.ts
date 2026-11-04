import type {FullConfig} from '@playwright/test';
import {createServiceWebFixture} from '../../../service/tests/service-web-fixture';

/** Владеет единственным actual service и graceful IPC teardown вместо Next/Vite proxy. */
export default async function setup(configuration:FullConfig){
 const baseURL=configuration.projects[0]?.use.baseURL;if(typeof baseURL!=='string')throw new Error('Service web baseURL is required.');
 const url=new URL(baseURL),fixture=await createServiceWebFixture(Number(url.port));
 try{const running=await fixture.start();if(running.url!==url.origin)throw new Error('Owned service origin differs from browser configuration.');}
 catch(error){await fixture.close();throw error;}
 return async()=>fixture.close();
}
