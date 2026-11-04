import {defineConfig} from '@playwright/test';
import production from './playwright.production.config';
import path from 'node:path';
import {tmpdir} from 'node:os';

const port=Number(process.env.OURO_E2E_PORT??3358);
if([3000,3220].includes(port))throw new Error('Binding qualification cannot target a live or existing preview port.');
const dataDir=path.resolve(process.env.OURO_E2E_DATA_DIR!),relative=path.relative(path.resolve('artifacts'),dataDir);
const ownedArtifact=relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);
const ownedTemporary=path.dirname(dataDir)===path.resolve(tmpdir())&&path.basename(dataDir).startsWith('ouro-production-e2e-');
if(!ownedArtifact&&!ownedTemporary)throw new Error('Binding qualification requires an owned artifact or temporary E2E database.');
export default defineConfig({...production,projects:[{}],globalSetup:'./e2e/binding-recovery-global-setup.ts',testMatch:'workspace-binding-recovery.spec.ts',reporter:[['list'],['json',{outputFile:'test-results/binding-recovery-results.json'}]]});
