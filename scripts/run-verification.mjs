import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// This client invokes one fixed server adapter; it never sends shell commands or executable paths.
const args=process.argv.slice(2),options=new Map();
for(let index=0;index<args.length;index+=2){if(!['--url','--project','--execution','--cases','--token-file'].includes(args[index])||!args[index+1]||options.has(args[index]))throw new Error('Usage: node scripts/run-verification.mjs --url http://127.0.0.1:3220 --project ID --execution ID --cases case1,case2 [--token-file PATH]');options.set(args[index],args[index+1]);}
const base=new URL(options.get('--url')??'http://127.0.0.1:3220');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('A plain HTTP(S) server URL is required.');
if(!options.get('--project')||!options.get('--execution')||!options.get('--cases'))throw new Error('Project, execution and exact case IDs are required.');
const headers={'Content-Type':'application/json'},auth=options.get('--token-file');
if(auth)headers.Authorization='Bearer '+(await readFile(auth,'utf8')).trim();
else{
 if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Remote servers require a human credential file.');
 const session=await fetch(new URL('/api/session',base));if(!session.ok)throw new Error('A local human session is unavailable.');
 const cookie=session.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('No local human session was issued.');headers.Cookie=cookie;
}
const project=encodeURIComponent(options.get('--project')),snapshot=await fetch(new URL('/api/projects/'+project,base),{headers});
if(!snapshot.ok)throw new Error('Project is unavailable for this human identity.');const state=await snapshot.json();
const body={requestId:randomUUID(),expectedVersion:state.cursor,executionId:options.get('--execution'),scopeCaseIds:options.get('--cases').split(',')};
// Print the exact non-secret recovery body before the long operation; never print credentials.
process.stdout.write(JSON.stringify({action:'runVerification',projectId:options.get('--project'),body})+'\n');
const response=await fetch(new URL('/api/projects/'+project+'/verification/run',base),{method:'POST',headers,body:JSON.stringify(body)}),result=await response.json();
if(!response.ok){process.stderr.write(JSON.stringify(result)+'\n');process.exitCode=1;}else process.stdout.write(JSON.stringify({ok:true,cursor:result.cursor,replayed:result.replayed,runId:result.state.verificationRuns.at(-1)?.id})+'\n');
