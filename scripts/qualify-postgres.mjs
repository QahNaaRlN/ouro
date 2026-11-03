import {spawnSync} from 'node:child_process';
if(process.env.OURO_TEST_DB_CONFIRM!=='DEDICATED_DISPOSABLE_DATABASES'||!process.env.OURO_TEST_DATABASE_URL||!process.env.OURO_TEST_EMPTY_DATABASE_URL||!process.env.OURO_TEST_ADMIN_DATABASE_URL||!process.env.OURO_TEST_PG_CONTAINER){console.error('Dedicated disposable app/admin URLs, owned PostgreSQL container and OURO_TEST_DB_CONFIRM=DEDICATED_DISPOSABLE_DATABASES are mandatory.');process.exit(2);}
if(process.env.OURO_TEST_DATABASE_URL===process.env.OURO_TEST_EMPTY_DATABASE_URL||process.env.OURO_TEST_DATABASE_URL===process.env.DATABASE_URL||process.env.OURO_TEST_EMPTY_DATABASE_URL===process.env.DATABASE_URL){console.error('Qualification databases must be distinct and must not be DATABASE_URL.');process.exit(2);}
try{
 const app=new URL(process.env.OURO_TEST_DATABASE_URL),empty=new URL(process.env.OURO_TEST_EMPTY_DATABASE_URL),admin=new URL(process.env.OURO_TEST_ADMIN_DATABASE_URL);
 if(app.username!=='ouro'||empty.username!=='ouro'||admin.username!=='ouro_admin'||app.host!==admin.host||empty.host!==admin.host||admin.pathname!=='/postgres'||app.pathname===empty.pathname)throw new Error('SCOPE');
}catch{console.error('Qualification must use distinct dedicated databases and separate ouro / ouro_admin roles on the same owned service.');process.exit(2);}
const result=spawnSync(process.execPath,['--import','tsx','--no-wasm-code-gc','--test','--test-concurrency=1','tests/external-postgres.test.ts'],{stdio:'inherit',env:process.env});
process.exit(result.status??1);
