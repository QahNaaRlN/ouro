'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, CircleCheck, Clock3, Copy, GitBranch, Github, Link2, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert, Unplug } from 'lucide-react';
import { Status } from '@/components/roadmap';
import type { GitHubBinding, GitHubCommitSource, ProjectState } from '@/packages/core/src';
import './github-panel.css';

type Delivery = {
  id:string;deliveryId:string;repositoryId:number;repositoryFullName:string;ref:string;
  status:'pending'|'processing'|'retryable'|'processed'|'needs_review';attempts:number;
  reason:string|null;lastError:string|null;receivedAt:string;updatedAt:string;nextAttemptAt?:string|null;commitCount?:number;
};
type GitHubInfo={bindings:GitHubBinding[];deliveries:Delivery[];setup:{webhookSecretConfigured:boolean;apiTokenConfigured:boolean;webhookUrl:string;verification:'github-api-sha'}};
const deliveryNames:Record<Delivery['status'],string>={pending:'В очереди',processing:'Проверяется',retryable:'Можно повторить',processed:'Обработано',needs_review:'Нужна проверка человека'};
const reasonNames:Record<string,string>={TAG_IGNORED:'Push тега пропущен.',DELETION_IGNORED:'Удаление ветки пропущено.',NO_ACTIVE_BINDING:'Для репозитория и ветки нет действующей привязки.',NO_COMMITS:'В доставке нет новых коммитов.',INCOMPLETE_PUSH:'Список коммитов неполный. Нужна полная доставка.',PUSH_LIMIT_REACHED:'Достигнут предел списка коммитов. Нужна проверка полноты.'};
const date=(value:string)=>new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const repositoryPattern='[A-Za-z0-9][A-Za-z0-9\\-]*/[A-Za-z0-9_.\\-]+';
const commitUrl=(source:GitHubCommitSource)=>`https://github.com/${source.repositoryFullName.split('/').map(encodeURIComponent).join('/')}/commit/${encodeURIComponent(source.fullSha)}`;

export default function GitHubPanel({state,onSnapshot}:{state:ProjectState;onSnapshot?:(data:unknown)=>void|Promise<void>}){
  const [info,setInfo]=useState<GitHubInfo|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  const [executionId,setExecutionId]=useState(''),[repository,setRepository]=useState(''),[ref,setRef]=useState('refs/heads/main');
  const [baseVersion,setBaseVersion]=useState<number|null>(null);
  const sequence=useRef(0),mounted=useRef(false),activeRead=useRef<AbortController|null>(null);
  const reload=useCallback(async()=>{
    const own=++sequence.current;
    activeRead.current?.abort();const controller=new AbortController();activeRead.current=controller;
    try{
      const response=await fetch('/api/github',{cache:'no-store',signal:controller.signal}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??'Не удалось получить состояние GitHub.');
      if(mounted.current&&own===sequence.current){setInfo(body);setLoadError('');}
    }catch(e){if(!controller.signal.aborted&&mounted.current&&own===sequence.current)setLoadError(e instanceof Error?e.message:'Не удалось обновить состояние GitHub.');}
    finally{if(mounted.current&&own===sequence.current)setLoading(false);}
  },[]);
  useEffect(()=>{mounted.current=true;void reload();const timer=setInterval(()=>void reload(),3000);return()=>{mounted.current=false;sequence.current++;activeRead.current?.abort();clearInterval(timer);};},[reload]);
  const execution=state.executions.find(e=>e.id===executionId),spec=state.specs.find(s=>s.id===execution?.specId),revision=state.revisions.find(r=>r.id===execution?.specRevisionId);
  const bindings=(onSnapshot?state.githubBindings:(info?.bindings??state.githubBindings))??[];
  const sources=state.events.filter(event=>event.type==='ActionReported'&&(event.payload.source as {kind?:string}|undefined)?.kind==='github_commit').toReversed();
  const markBase=()=>{if(baseVersion===null)setBaseVersion(state.version);setError('');setNotice('');};
  const mutate=async(url:string,payload:Record<string,unknown>)=>{
    if(busy)return false;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??'Изменение не принято.');
      if(body.state)await onSnapshot?.(body);
      await reload();return true;
    }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить действие.');return false;}finally{setBusy(false);}
  };
  const create=async(event:FormEvent)=>{
    event.preventDefault();if(!execution)return;
    if(await mutate('/api/github/bindings',{executionId,repositoryFullName:repository.trim(),ref:ref.trim(),requestId:crypto.randomUUID(),expectedVersion:baseVersion??state.version})){
      setExecutionId('');setRepository('');setRef('refs/heads/main');setBaseVersion(null);setNotice('Привязка создана. Контекст попытки зафиксирован; webhook настраивается отдельно.');
    }
  };
  const revoke=async(binding:GitHubBinding)=>{
    if(await mutate(`/api/github/bindings/${encodeURIComponent(binding.id)}/revoke`,{requestId:crypto.randomUUID(),expectedVersion:state.version}))setNotice('Привязка отозвана. Уже записанные факты сохранены.');
  };
  const retry=async(delivery:Delivery)=>{
    if(await mutate(`/api/github/deliveries/${encodeURIComponent(delivery.id)}/retry`,{}))setNotice('Повторная проверка поставлена в очередь. Новый факт появится только после успешной проверки.');
  };
  const copyUrl=async()=>{try{await navigator.clipboard.writeText(info!.setup.webhookUrl);setCopied(true);}catch{setError('Буфер обмена недоступен. Скопируйте URL из поля.');}};
  let localUrl=false;try{localUrl=!!info&&['localhost','127.0.0.1','[::1]'].includes(new URL(info.setup.webhookUrl).hostname);}catch{}
  return <div className="github-panel">
    <div className="page-heading"><div><div className="eyebrow">ИНТЕГРАЦИИ · ИСТОЧНИКИ ФАКТОВ</div><h1><Github size={25}/>GitHub</h1><p>Коммиты становятся проверяемыми фактами конкретной попытки. Решения и приёмка остаются у человека.</p></div><button className="btn" onClick={()=>void reload()} disabled={loading||busy}><RefreshCw size={14}/>Обновить GitHub</button></div>
    {loadError&&<div className="github-error" role="alert">{loadError} {info?'Последние полученные данные сохранены.':'Состояние сервера пока не получено.'}</div>}
    {error&&<div className="github-error" role="alert">{error}</div>}
    {notice&&<div className="github-notice" role="status"><Check size={15}/>{notice}</div>}
    <section className="github-section github-setup" aria-label="Настройка GitHub">
      <div className="section-heading"><h2>Настройка сервера</h2>{loading?<span className="quiet-label">Читаем настройки…</span>:info&&<span className={`github-pill ${info.setup.webhookSecretConfigured?'positive':'attention'}`}>{info.setup.webhookSecretConfigured?<ShieldCheck size={13}/>:<TriangleAlert size={13}/>} {info.setup.webhookSecretConfigured?'Секрет webhook задан':'Секрет webhook не задан'}</span>}</div>
      <p>Секрет webhook задаётся на сервере через <code>OURO_GITHUB_WEBHOOK_SECRET</code>. Токен <code>OURO_GITHUB_TOKEN</code> нужен для доступа к закрытым репозиториям. Значения ключей здесь не отображаются.</p>
      {info&&<><div className="github-setup-meta"><span className="github-pill">{info.setup.apiTokenConfigured?'Токен GitHub API задан':'Публичный API без токена'}</span><span className="github-pill"><ShieldCheck size={13}/>Проверка SHA через GitHub API</span></div><label className="github-url-label"><span>Webhook URL</span><div><input aria-label="Webhook URL" readOnly value={info.setup.webhookUrl}/><button className="btn" onClick={()=>void copyUrl()}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Скопировано':'Скопировать URL'}</button></div></label>{localUrl&&<p className="github-context-warning">Этот локальный адрес недоступен GitHub. Для внешней доставки нужен публичный HTTPS-адрес, заданный серверу через <code>OURO_PUBLIC_URL</code>.</p>}</>}
      <ol className="github-setup-steps"><li>Задайте серверный секрет и при необходимости токен GitHub API.</li><li>В репозитории откройте Settings → Webhooks. Укажите этот URL, Content type <code>application/json</code>, событие <code>push</code> и тот же секрет.</li><li>Привяжите точную ветку к разрешённой попытке исполнения.</li></ol>
      <p className="helper-note">Подключение GitHub в ChatGPT не настраивает этот сервер. <a href="https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks" target="_blank" rel="noreferrer">Как создать webhook <ArrowUpRight size={12}/></a></p>
    </section>
    <section className="github-section" aria-label="Привязать репозиторий к попытке">
      <div className="section-heading"><h2>Привязать репозиторий к попытке</h2><Link2 size={19}/></div>
      <p>Репозиторий проверяется через GitHub API. Привязка сохраняет ревизию выбранной попытки и не переезжает на новую активную ревизию.</p>
      <form className="github-binding-form" onSubmit={create}>
        <label className="github-wide"><span>Попытка исполнения</span><select required value={executionId} disabled={busy} onChange={event=>{markBase();setExecutionId(event.target.value);}}><option value="">Выберите существующую попытку</option>{state.executions.toReversed().map(e=>{const s=state.specs.find(s=>s.id===e.specId),r=state.revisions.find(r=>r.id===e.specRevisionId);return <option key={e.id} value={e.id}>{s?.humanId??e.specId} · r{r?.revision??'?'} · {e.kind==='remediation'?'устранение':'основная'} · {e.state} · {e.id.slice(0,8)}</option>;})}</select></label>
        <label><span>Репозиторий</span><input required autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={200} pattern={repositoryPattern} title="Укажите owner/repository, без URL." placeholder="owner/repository" value={repository} disabled={busy} onChange={event=>{markBase();setRepository(event.target.value);}}/></label>
        <label><span>Ветка GitHub</span><input required autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500} pattern="refs/heads/.+" title="Укажите полный ref вида refs/heads/main." placeholder="refs/heads/main" value={ref} disabled={busy} onChange={event=>{markBase();setRef(event.target.value);}}/></label>
        {execution&&spec&&revision&&<div className="github-context github-wide" role="region" aria-label="Контекст привязки"><div><strong>{spec.humanId} · {revision.title}</strong><span>Ревизия r{revision.revision} · {execution.kind==='remediation'?'Устранение блокера':'Основная попытка'}</span></div><Status state={execution.state}/><code>{execution.id}</code>{spec.activeRevisionId!==revision.id&&<p className="github-context-warning">Попытка относится к прежней ревизии. Будущие коммиты останутся в этом историческом контексте.</p>}</div>}
        {baseVersion!==null&&baseVersion!==state.version&&<div className="github-context-warning github-wide" role="status">Появились новые события. Проверьте выбранную попытку перед повторной записью.<button type="button" className="text-btn" disabled={busy} onClick={()=>{setBaseVersion(state.version);setError('');}}>Обновить базу после проверки</button></div>}
        <div className="github-form-action github-wide"><button className="btn btn-primary" type="submit" disabled={busy||!execution||!repository.trim()||!ref.trim()}>{busy?<LoaderCircle size={15} className="spin"/>:<Link2 size={15}/>}Создать привязку</button><span>Привязка не запускает агента и не завершает попытку.</span></div>
      </form>
      {!state.executions.length&&<p className="github-empty">Сначала разрешите попытку исполнения в спецификации.</p>}
    </section>
    <section className="github-section" aria-label="Привязки GitHub"><div className="section-heading"><h2>Привязки</h2><span className="quiet-label">ДЕЙСТВУЮЩИХ: {bindings.filter(b=>!b.revokedAt).length}</span></div>
      {bindings.length?<div className="github-bindings">{bindings.toReversed().map(binding=>{const s=state.specs.find(s=>s.id===binding.specId),r=state.revisions.find(r=>r.id===binding.specRevisionId);return <article className={`github-binding ${binding.revokedAt?'revoked':''}`} key={binding.id}><div className="github-binding-icon"><GitBranch size={20}/></div><div className="github-binding-body"><a href={`https://github.com/${binding.repositoryFullName.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noreferrer"><strong>{binding.repositoryFullName}</strong><ArrowUpRight size={13}/></a><code>{binding.ref}</code><p>{s?.humanId??binding.specId} · r{r?.revision??'?'} · {r?.title??'Историческая ревизия'}</p><small>Попытка {binding.executionId} · создана {date(binding.createdAt)}</small></div><div className="github-binding-actions"><span className={`github-pill ${binding.revokedAt?'':'positive'}`}>{binding.revokedAt?<Unplug size={12}/>:<Link2 size={12}/>} {binding.revokedAt?'Привязка отозвана':'Действует'}</span>{binding.revokedAt?<small>{date(binding.revokedAt)}</small>:<button className="btn btn-small" disabled={busy} onClick={()=>void revoke(binding)}>Отозвать привязку</button>}</div></article>;})}</div>:<p className="github-empty">Привязок пока нет. Источник коммита появится после настройки и подтверждённой доставки.</p>}
    </section>
    <section className="github-section" aria-label="Доставки GitHub"><div className="section-heading"><h2>Доставки GitHub</h2><span className="quiet-label">{info?`${info.deliveries.length} ДОСТАВОК`:'НЕТ ДАННЫХ'}</span></div><p>Принятый webhook сначала попадает в очередь. До успешной проверки коммит не становится фактом.</p>
      {!info?<p className="github-empty">Состояние очереди ещё не получено.</p>:info.deliveries.length?<div className="github-deliveries">{info.deliveries.map(delivery=><article className="github-delivery" key={delivery.id}><div className="github-delivery-heading"><strong>{delivery.repositoryFullName}</strong><span className={`github-pill delivery-${delivery.status}`}>{delivery.status==='processed'?<CircleCheck size={12}/>:delivery.status==='needs_review'||delivery.status==='retryable'?<TriangleAlert size={12}/>:<Clock3 size={12}/>} {deliveryNames[delivery.status]}</span></div><code>{delivery.ref}</code><div className="github-delivery-meta"><span>Попыток проверки: {delivery.attempts}</span><span>Получено {date(delivery.receivedAt)}</span>{delivery.commitCount!==undefined&&<span>Коммитов в доставке: {delivery.commitCount}</span>}</div>{delivery.reason&&<p>{reasonNames[delivery.reason]??delivery.reason}</p>}{delivery.lastError&&<p className="github-delivery-error">{delivery.lastError}</p>}{delivery.status==='needs_review'&&<p className="github-context-warning">Проверьте полноту доставки в GitHub. Обычный повтор не восполнит отсутствующие данные; используйте полную повторную доставку.</p>}{delivery.nextAttemptAt&&delivery.status==='retryable'&&<p className="helper-note">Следующая попытка: {date(delivery.nextAttemptAt)}</p>}<div className="github-delivery-footer"><small>Delivery ID · {delivery.deliveryId}</small>{delivery.status==='retryable'&&<button className="btn btn-small" disabled={busy} onClick={()=>void retry(delivery)}><RefreshCw size={13}/>Повторить проверку</button>}</div></article>)}</div>:<p className="github-empty">Доставок пока нет. Их отсутствие не подтверждает настройку webhook.</p>}
      <p className="helper-note">GitHub автоматически не повторяет неудачные доставки. Если Ouro не принял webhook, повторите доставку в GitHub. <a href="https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries" target="_blank" rel="noreferrer">Инструкция redelivery <ArrowUpRight size={12}/></a></p>
    </section>
    <section className="github-section" aria-label="Проверенные коммиты"><div className="section-heading"><h2>Проверенные коммиты</h2><ShieldCheck size={18}/></div><p>Проверка SHA через GitHub API подтверждает существование объекта коммита; не подтверждает GPG-подпись, качество кода или DoD.</p>
      {sources.length?<div className="github-commits">{sources.map(event=>{const source=event.payload.source as GitHubCommitSource,s=state.specs.find(s=>s.id===event.specId),r=state.revisions.find(r=>r.id===event.specRevisionId);return <article key={event.id} className="github-commit"><div><a href={commitUrl(source)} target="_blank" rel="noreferrer"><code title={source.fullSha}>{source.fullSha.slice(0,12)}</code><ArrowUpRight size={13}/></a><strong>{String(event.payload.title??'Коммит GitHub')}</strong><p>{source.repositoryFullName} · {source.ref}</p><small>{s?.humanId??event.specId} · r{r?.revision??'?'} · попытка {event.executionId}</small></div><div><span className="github-pill positive"><ShieldCheck size={12}/>Проверен через API</span><small>{date(source.verifiedAt)}</small><code>github-api-sha</code></div></article>;})}</div>:<p className="github-empty">Проверенных коммитов пока нет. Здесь появятся факты с источником GitHub, отдельно от сообщений агента.</p>}
    </section>
  </div>;
}
