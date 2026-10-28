import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type GitHubRepository={id:number;fullName:string};
export type GitHubVerifiedCommit={repositoryId:number;repositoryFullName:string;fullSha:string;url:string;verifiedAt:string;verificationMethod:'github-api-sha';title:string};
export type NormalizedGitHubPush={repositoryId:number;repositoryFullName:string;ref:string;before:string;after:string;commitShas:string[];payloadDigest:string;disposition:'pending'|'ignored'|'needs_review';reason?:string};
export class GitHubVerificationError extends Error {
  constructor(public code:'VALIDATION_ERROR'|'VERIFICATION_FAILED'|'GITHUB_UNAVAILABLE',message:string,public retryable=false,public retryAfterMs?:number){super(message);this.name='GitHubVerificationError';}
}
const invalid=(message:string):never=>{throw new GitHubVerificationError('VALIDATION_ERROR',message);};
const failed=(message:string):never=>{throw new GitHubVerificationError('VERIFICATION_FAILED',message);};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fullName=(value:unknown):string=>{
  if(typeof value!=='string'||!/^[-A-Za-z0-9_.]{1,100}\/[-A-Za-z0-9_.]{1,100}$/.test(value)||value.split('/').some(part=>part==='.'||part==='..'))invalid('Укажите репозиторий GitHub в формате owner/repository.');
  return value as string;
};
const fullSha=(value:unknown):string=>{
  if(typeof value!=='string'||!/^[a-fA-F0-9]{40}$/.test(value))invalid('Нужен полный SHA коммита GitHub (40 шестнадцатеричных символов).');
  return (value as string).toLowerCase();
};

/** Verify the exact bytes before JSON decoding. Neither diagnostic output nor errors contain the secret. */
export function verifyGitHubSignature(raw:Uint8Array,signature:string|null,secret:string):boolean{
  if(!(raw instanceof Uint8Array)||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature)||typeof secret!=='string'||!secret)return false;
  const expected=createHmac('sha256',secret).update(raw).digest(),received=Buffer.from(signature.slice(7),'hex');
  return received.length===expected.length&&timingSafeEqual(expected,received);
}

/** Persist compact references only. An incomplete candidate list must never look successfully imported. */
export function normalizeGitHubPush(raw:Uint8Array):NormalizedGitHubPush{
  if(!(raw instanceof Uint8Array)||raw.byteLength>2*1024*1024)invalid('Размер webhook ограничен 2 MiB.');
  let payload:unknown;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{invalid('Webhook должен содержать корректный UTF-8 JSON.');}
  if(!object(payload)||!object(payload.repository))invalid('В push отсутствует репозиторий.');
  const body=payload as Record<string,unknown>,repo=body.repository as Record<string,unknown>;
  if(!Number.isSafeInteger(repo.id)||Number(repo.id)<1)invalid('Некорректный ID репозитория.');
  const repositoryFullName=fullName(repo.full_name);
  if(typeof body.ref!=='string'||!body.ref||body.ref.length>1024||/[\x00-\x20\x7f]/.test(body.ref))invalid('Некорректный ref push.');
  const ref=body.ref as string,before=fullSha(body.before),after=fullSha(body.after);
  if(!Array.isArray(body.commits))invalid('В push нужен список коммитов.');
  if(body.deleted!==undefined&&typeof body.deleted!=='boolean')invalid('Некорректный признак удаления ref.');
  const commits=body.commits as unknown[],shas:string[]=[];
  for(const commit of commits){if(!object(commit))invalid('Некорректный коммит push.');shas.push(fullSha((commit as Record<string,unknown>).id));}
  for(const key of ['size','distinct_size'])if(body[key]!==undefined&&(!Number.isSafeInteger(body[key])||Number(body[key])<0))invalid('Некорректное количество коммитов push.');
  const unique=[...new Set(shas)];
  let disposition:NormalizedGitHubPush['disposition']='pending',reason:string|undefined;
  if(body.deleted===true||after==='0'.repeat(40)){disposition='ignored';reason='Ветка или тег удалены; коммит не импортируется.';}
  else if(!ref.startsWith('refs/heads/')||ref.length==='refs/heads/'.length){disposition='ignored';reason='Push не относится к ветке refs/heads/*.';}
  else if(commits.length>=2048||Number(body.size??commits.length)>commits.length||Number(body.distinct_size??commits.length)>commits.length){disposition='needs_review';reason='Список коммитов достиг лимита или неполон; требуется явная дозагрузка.';}
  else if(unique.length!==shas.length){disposition='needs_review';reason='В списке push повторяются SHA; требуется проверка доставки.';}
  else if(after!==before&&!unique.includes(after)){disposition='needs_review';reason='В списке push отсутствует конечный SHA; требуется проверка полноты.';}
  return {repositoryId:Number(repo.id),repositoryFullName,ref,before,after,commitShas:unique.slice(0,2048),payloadDigest:createHash('sha256').update(raw).digest('hex'),disposition,...(reason?{reason}:{})};
}

const API_ORIGIN='https://api.github.com';
const apiUrl=(value:string,base=API_ORIGIN):URL=>{
  let url:URL;try{url=new URL(value,base);}catch{failed('GitHub вернул неподдерживаемый адрес API.');}
  if(url!.origin!==API_ORIGIN||url!.username||url!.password||url!.hash)failed('GitHub API перенаправил запрос за разрешённую границу.');
  return url!;
};
const retryDelay=(headers:Headers)=>{
  const seconds=Number(headers.get('retry-after'));
  const until=Number(headers.get('x-ratelimit-reset'))*1000-Date.now();
  return Math.min(3_600_000,Math.max(1000,Number.isFinite(seconds)&&seconds>0?seconds*1000:until>0?until:60_000));
};

/** Fixed-host server client. Injected fetch makes protocol/error cases testable without runtime credentials. */
export function createGitHubClient(options:{fetch?:typeof fetch;token?:string;timeoutMs?:number}={}){
  const fetcher=options.fetch??globalThis.fetch;
  const timeout=Math.max(1,Math.min(10_000,Math.floor(options.timeoutMs??5000)));
  const requestJson=async(path:string):Promise<Record<string,unknown>>=>{
    let url=apiUrl(path);
    const headers:Record<string,string>={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'ouro-github-evidence'};
    if(options.token)headers.Authorization=`Bearer ${options.token}`;
    try{
      for(let redirects=0;redirects<=4;redirects++){
        const response=await fetcher(url.href,{headers,redirect:'manual',signal:AbortSignal.timeout(timeout)});
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');
          if(!location||redirects===4)failed('GitHub API не подтвердил адрес репозитория.');
          url=apiUrl(location!,url.href);continue;
        }
        if(response.status===429||response.status>=500||response.status===408||(response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after'))))throw new GitHubVerificationError('GITHUB_UNAVAILABLE','GitHub API временно недоступен; проверка будет повторена.',true,retryDelay(response.headers));
        if(!response.ok)failed('GitHub API не подтвердил доступ к репозиторию или коммиту.');
        const body:unknown=await response.json();if(!object(body))failed('GitHub API вернул неподтверждённые данные.');return body as Record<string,unknown>;
      }
    }catch(error){if(error instanceof GitHubVerificationError)throw error;throw new GitHubVerificationError('GITHUB_UNAVAILABLE','Не удалось получить подтверждение от GitHub API; проверка будет повторена.',true,60_000);}
    return failed('GitHub API не подтвердил данные.');
  };
  const resolveRepository=async(value:string):Promise<GitHubRepository>=>{
    const requested=fullName(value),response=await requestJson(`/repos/${requested}`);
    if(!Number.isSafeInteger(response.id)||Number(response.id)<1)failed('GitHub API вернул неподтверждённый ID репозитория.');
    let canonical:string;try{canonical=fullName(response.full_name);}catch{failed('GitHub API вернул неподтверждённое имя репозитория.');}
    return {id:Number(response.id),fullName:canonical!};
  };
  return {resolveRepository,async verifyCommit(repository:GitHubRepository,value:string):Promise<GitHubVerifiedCommit>{
    const sha=fullSha(value);if(!repository||!Number.isSafeInteger(repository.id)||repository.id<1)invalid('Нужен проверенный ID репозитория.');
    const current=await resolveRepository(repository.fullName);
    if(current.id!==repository.id)failed('GitHub API подтвердил другой репозиторий; привязка не переносится.');
    const commit=await requestJson(`/repos/${current.fullName}/commits/${sha}`);
    if(typeof commit.sha!=='string'||commit.sha.toLowerCase()!==sha)failed('GitHub API не подтвердил точный SHA коммита.');
    return {repositoryId:current.id,repositoryFullName:current.fullName,fullSha:sha,url:`https://github.com/${current.fullName}/commit/${sha}`,verifiedAt:new Date().toISOString(),verificationMethod:'github-api-sha',title:`Коммит ${sha.slice(0,12)}`};
  }};
}
