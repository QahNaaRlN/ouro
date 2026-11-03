import {defineConfig} from '@playwright/test';
// This bounded synthetic report describes behavior and prerequisite failures.
// A host pull-request diff is unrelated input and can exceed the import limit.
export default defineConfig({testDir:'.',testMatch:'behavior.spec.ts',workers:1,retries:0,reporter:'json',globalSetup:'./setup.ts',captureGitInfo:{commit:false,diff:false}});
