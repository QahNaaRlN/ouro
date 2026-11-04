import {defineConfig} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root=process.cwd(),manifest=process.env.OURO_RECEIPT_BROWSER_MANIFEST??path.join(mkdtempSync(path.join(tmpdir(),'ouro-browser-receipt-')),'fixture.json'),directory=path.dirname(manifest),apiPort=3497,webPort=3498;
process.env.OURO_RECEIPT_BROWSER_MANIFEST=manifest;

/** Изолированный Next owner и Vite fixture исполняют настоящий browser fetch и WebCrypto. */
export default defineConfig({
 testDir:'./e2e',testMatch:'http-receipt-proof.browser.ts',fullyParallel:false,workers:1,retries:0,
 use:{baseURL:`http://127.0.0.1:${webPort}`,headless:true,launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']}},
 webServer:[
  {command:'node --no-wasm-code-gc --import tsx e2e/receipt-proof-server.ts',cwd:root,url:`http://127.0.0.1:${apiPort}/api/health`,reuseExistingServer:false,timeout:120000,gracefulShutdown:{signal:'SIGTERM',timeout:10000},env:{OURO_RECEIPT_BROWSER_PROFILE:path.join(directory,'profile'),OURO_RECEIPT_BROWSER_MANIFEST:manifest,OURO_RECEIPT_BROWSER_API_PORT:String(apiPort)}},
  {command:`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,cwd:path.join(root,'apps/web'),url:`http://127.0.0.1:${webPort}/tests/fixtures/receipt-probe.html`,reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:5000},env:{OURO_WEB_API_ORIGIN:`http://127.0.0.1:${apiPort}`}},
 ],reporter:[['list'],['json',{outputFile:'test-results/receipt-proof-results.json'}]],
});
