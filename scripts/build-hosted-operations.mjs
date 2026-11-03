import {build} from 'esbuild';
await build({entryPoints:['scripts/verify-postgres.ts','scripts/bootstrap-cloud-owner.ts'],outdir:'.operations',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external'});
