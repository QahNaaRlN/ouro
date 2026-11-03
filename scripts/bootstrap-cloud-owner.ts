import {readFile,stat} from 'node:fs/promises';
import {createStore} from '../lib/store';
import {PROJECT_ID,type Actor} from '../packages/core/src';
import {normalizeUserEmail,validUserEmail,validUserName,validUserPassword} from '../lib/user-auth';
if(process.env.OURO_BOOTSTRAP_CONFIRM!=='CREATE_NEW_CLOSED_CLOUD_PROJECT'||!process.env.DATABASE_URL||!process.env.OURO_BOOTSTRAP_FILE)throw new Error('Explicit cloud bootstrap confirmation, DATABASE_URL and protected input file are required.');
const file=process.env.OURO_BOOTSTRAP_FILE,info=await stat(file);
if(!info.isFile()||(process.platform!=='win32'&&(info.mode&0o077)!==0))throw new Error('Bootstrap input must be a private regular file (0600).');
const input=JSON.parse(await readFile(file,'utf8'));
if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!=='email,name,password,projectName')throw new Error('Bootstrap input requires email, name, password, projectName only.');
if(!validUserEmail(normalizeUserEmail(input.email))||!validUserName(input.name)||!validUserName(input.projectName)||!validUserPassword(input.password))throw new Error('Bootstrap account/project fields do not meet the existing validation rules.');
const store=await createStore({databaseUrl:process.env.DATABASE_URL,seedEvents:[]});
try{
 const accounts=await store.inspect<{count:string}>('SELECT count(*) FROM ouro_user_accounts');
 if(Number(accounts.rows[0].count)!==0)throw new Error('Cloud bootstrap is one-time and refuses a database with existing accounts. Review partial results instead of retrying creation.');
 const operator:Actor={id:'local-human',kind:'human',name:'Trusted offline bootstrap',projectIds:[PROJECT_ID]};
 const {account}=await store.createAccount({email:input.email,name:input.name,password:input.password},operator);
 const actor:Actor={id:account.id,kind:'human',name:account.name,projectIds:[]};
 const project=await store.createProject({name:input.projectName},actor);
 console.log(JSON.stringify({ok:true,userId:account.id,projectId:project.id,role:project.role}));
}finally{await store.close();}
