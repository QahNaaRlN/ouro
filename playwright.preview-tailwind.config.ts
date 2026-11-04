import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';

const webPort=3453,dataDir=resolve('.operations/preview-profile');
process.env.OURO_E2E_DATA_DIR=dataDir;
/** Оба runtime принадлежат собственной disposable проверке; профиль сохраняется между before/after. */
export default defineConfig({testDir:'./e2e',testMatch:'tailwind-preview.browser.ts',workers:1,retries:0,outputDir:'test-results/preview-renderer',reporter:'list',globalSetup:'./e2e/preview-renderer-setup.ts',use:{baseURL:`http://127.0.0.1:${webPort}`,headless:true,reducedMotion:'reduce',trace:'retain-on-failure',actionTimeout:10000}});
