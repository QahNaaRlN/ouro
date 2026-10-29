import {spawnSync} from 'node:child_process';

const types='feat|fix|docs|chore|refactor|test|ci|build|perf|revert';
const branchTypes=types+'|hotfix';
const core='(?:0|[1-9][0-9]*)';
const pre='(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver=`${core}\\.${core}\\.${core}(?:-${pre}(?:\\.${pre})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?`;
const branchPattern=new RegExp(`^(?:main|dev|(?:${branchTypes})/[a-z0-9]+(?:-[a-z0-9]+)*|release/${semver})$`);
const subjectPattern=new RegExp(`^(?:${types})(?:\\([a-z0-9]+(?:[-/][a-z0-9]+)*\\))?!?: ([\\x20-\\x7e]+)$`);
const help=`Check Ouro repository conventions.

node scripts/check-conventions.mjs
node scripts/check-conventions.mjs --branch feat/example --subject "feat: explain the change"
node scripts/check-conventions.mjs --branch release/0.1.0-beta.1 --all
node scripts/check-conventions.mjs --branch dev --base BASE_SHA --head HEAD_SHA

Without an explicit subject or range, checks the current HEAD subject.
--all includes the complete reachable history. Ranges require two full commit SHAs.
CI may provide OURO_CONVENTIONS_BRANCH, _TITLE, _BASE and _HEAD.
English prose in commit bodies is reviewed by humans; this check enforces ASCII subjects and syntax.
`;

function fail(message){throw new Error(message);}
function git(args){
 const result=spawnSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});
 if(result.status!==0)fail('Cannot inspect the requested Git history. Run inside the repository with the required commits fetched.');
 return result.stdout;
}
function checkBranch(value){
 if(typeof value!=='string'||value.length>200||!branchPattern.test(value))fail('Branch must be main, dev, an approved type/english-kebab-name, or release/SEMVER.');
}
function checkSubject(value,label){
 const match=typeof value==='string'?subjectPattern.exec(value):null;
 if(!match||value.length>300||match[1].trim()!==match[1]||!/[A-Za-z]/.test(match[1]))fail(`${label} must use an approved Conventional Commit type and a nonempty English ASCII description.`);
}
function readCommits(args){
 return git(args).split('\n').filter(Boolean).map(line=>{
  const split=line.indexOf('\0'),sha=line.slice(0,split),subject=line.slice(split+1);
  if(split!==40||!/^[a-f0-9]{40}$/i.test(sha))fail('Unexpected Git history format.');
  return {sha,subject};
 });
}

try{
 const argv=process.argv.slice(2);
 if(argv.length===1&&argv[0]==='--help')process.stdout.write(help);
 else{
  const allowed=new Set(['--branch','--subject','--title','--base','--head']),values=new Map();let all=false;
  for(let index=0;index<argv.length;index++){
   const option=argv[index];
   if(option==='--all'){if(all)fail('Do not repeat --all.');all=true;continue;}
   if(!allowed.has(option))fail('Unknown option. Use --help.');
   if(values.has(option)||argv[index+1]===undefined||argv[index+1].startsWith('--'))fail('Each option requires one value. Use --help.');
   values.set(option,argv[++index]);
  }
  const selected=(option,env)=>values.has(option)?values.get(option):process.env[env];
  const branch=selected('--branch','OURO_CONVENTIONS_BRANCH')??git(['branch','--show-current']).trim();
  const title=selected('--title','OURO_CONVENTIONS_TITLE'),subject=values.get('--subject');
  const base=selected('--base','OURO_CONVENTIONS_BASE'),head=selected('--head','OURO_CONVENTIONS_HEAD');
  checkBranch(branch);if(title!==undefined)checkSubject(title,'Pull request title');
  if((base===undefined)!==(head===undefined))fail('A commit range requires both --base and --head.');
  if((all&&(base!==undefined||subject!==undefined))||(subject!==undefined&&base!==undefined))fail('Choose one explicit subject, a range, or --all.');
  let commits=[];
  if(subject!==undefined)checkSubject(subject,'Provided subject');
  else if(base!==undefined){
   if(!/^[a-f0-9]{40}$/i.test(base)||!/^[a-f0-9]{40}$/i.test(head))fail('Base and head must be full 40-character commit SHAs.');
   git(['cat-file','-e',`${base}^{commit}`]);git(['cat-file','-e',`${head}^{commit}`]);
   commits=readCommits(['log','--format=%H%x00%s',`${base}..${head}`]);
  }else commits=readCommits(all?['log','--format=%H%x00%s','HEAD']:['show','-s','--format=%H%x00%s','HEAD']);
  for(const commit of commits)checkSubject(commit.subject,`Commit ${commit.sha.slice(0,12)}`);
  process.stdout.write(`Conventions passed: branch ${branch}; ${commits.length+(subject===undefined?0:1)} commit subject(s)${title===undefined?'':'; pull request title checked'}.\n`);
 }
}catch(error){process.stderr.write(`Conventions failed: ${error instanceof Error?error.message:'Unable to check repository conventions.'}\n`);process.exitCode=1;}
