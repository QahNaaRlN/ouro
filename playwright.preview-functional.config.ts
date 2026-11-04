import {defineConfig} from '@playwright/test';

/** Реальный существующий proposal lifecycle проверяется отдельно от renderer и его saved facts. */
export default defineConfig({testDir:'./e2e',testMatch:'project-workspace-proposals.spec.ts',workers:1,retries:0,outputDir:'test-results/preview-functional',reporter:'list',metadata:{previewFunctional:true},globalSetup:'./e2e/preview-renderer-setup.ts',use:{baseURL:'http://127.0.0.1:3452',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',actionTimeout:15000}});
