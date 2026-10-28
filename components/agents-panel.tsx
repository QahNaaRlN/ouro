"use client";

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bot, Check, Copy, KeyRound, LoaderCircle, Plug, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';

export type AgentRegistration = {
  id: string; projectId: string; name: string; createdAt: string;
  lastSeenAt: string | null; revokedAt: string | null;
};
type ConnectionInfo = {httpUrl:string;stdioCommand:string;stdioArgs:string[];projectId:string};
type IssuedConnection = {agent:AgentRegistration;token:string;connection:ConnectionInfo};
type ClientConfig = 'stdio'|'cursor-http'|'claude-http';

const starter = 'Вызови ouro.get_context и найди назначенную тебе попытку. Прочитай назначенную ей ревизию, цель и DoD. Подтверди разрешённый запуск через ouro.confirm_started. Сообщай Action с evidence, а неоднозначности — через Question/Fork/Blocker. При блокировке жди решения человека, читая ouro.get_context или ouro.get_updates. Применение решения, возобновление и результат подтверждай отдельными tools. Человеческую приёмку DoD не подменяй своим успехом.';
function date(value:string){return new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}

export default function AgentsPanel({onAgentsChange}:{onAgentsChange:(agents:AgentRegistration[])=>void}) {
  const [agents,setAgents]=useState<AgentRegistration[]>([]),[name,setName]=useState('');
  const [issued,setIssued]=useState<IssuedConnection|null>(null),[client,setClient]=useState<ClientConfig>('stdio');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
  const reload=useCallback(async()=>{
    const response=await fetch('/api/agents',{cache:'no-store'});const body=await response.json();
    if(!response.ok)throw new Error(body.error?.message??'Не удалось прочитать регистрации агентов');
    setAgents(body.agents);onAgentsChange(body.agents);return body.agents as AgentRegistration[];
  },[onAgentsChange]);
  useEffect(()=>{let live=true;void reload().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});const timer=setInterval(()=>void reload().catch(()=>{}),8000);return()=>{live=false;clearInterval(timer);};},[reload]);
  const create=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!name.trim())return;setBusy(true);setError('');setCopied('');
    try{
      const response=await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Не удалось создать подключение');
      setIssued(body);setClient('stdio');setName('');await reload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const revoke=async(agent:AgentRegistration)=>{
    if(busy)return;setBusy(true);setError('');
    try{
      const response=await fetch(`/api/agents/${encodeURIComponent(agent.id)}/revoke`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Не удалось отозвать ключ');
      if(issued?.agent.id===agent.id)setIssued(null);await reload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label);}catch{setError('Буфер обмена недоступен. Выделите и скопируйте конфигурацию из поля.');}};
  const config=issued?JSON.stringify({mcpServers:{ouro:client==='stdio'?{command:issued.connection.stdioCommand,args:issued.connection.stdioArgs,env:{OURO_URL:issued.connection.httpUrl,OURO_AGENT_TOKEN:issued.token}}:{...(client==='claude-http'?{type:'http'}:{}),url:issued.connection.httpUrl,headers:{Authorization:`Bearer ${issued.token}`}}}},null,2):'';
  return <>
    <div className="page-heading"><div><div className="eyebrow">MCP · ПОДКЛЮЧЕНИЕ</div><h1>Подключить агента</h1><p>Один контракт для MCP-совместимых клиентов. Решения и приёмка остаются у человека.</p></div><button className="btn" disabled={loading||busy} onClick={()=>void reload().catch(e=>setError(e.message))}><RefreshCw size={15}/>Обновить</button></div>
    {error&&<div className="agent-error" role="alert">{error}</div>}
    <ol className="agent-steps"><li><span>1</span><div><strong>Создайте подключение</strong><p>Дайте логическому агенту имя и получите отдельный ключ.</p></div></li><li><span>2</span><div><strong>Добавьте MCP-конфигурацию</strong><p>Stdio для локального клиента или HTTP с Authorization.</p></div></li><li><span>3</span><div><strong>Назначьте работу</strong><p>Активируйте спеку и разрешите одну попытку выбранному агенту.</p></div></li></ol>
    <form className="agent-create" onSubmit={create}><label className="form-label">Имя агента<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Cursor · разработка ядра"/></label><button className="btn btn-primary" disabled={busy||!name.trim()} type="submit">{busy?<LoaderCircle size={15} className="spin"/>:<KeyRound size={15}/>}Создать ключ подключения</button></form>
    {issued&&<section className="agent-issued" aria-label="Новое подключение агента"><div className="section-heading"><div><span className="quiet-label">КОНФИГУРАЦИЯ ВЫДАЁТСЯ ОДИН РАЗ</span><h2>{issued.agent.name}</h2></div><ShieldCheck size={20}/></div><p>Скопируйте конфигурацию в настройки MCP клиента. После скрытия ключ нельзя прочитать повторно; для нового подключения создайте отдельную регистрацию.</p><div className="segmented agent-client-tabs" aria-label="Формат конфигурации"><button type="button" className={client==='stdio'?'selected':''} onClick={()=>{setClient('stdio');setCopied('');}}>Stdio · локально</button><button type="button" className={client==='cursor-http'?'selected':''} onClick={()=>{setClient('cursor-http');setCopied('');}}>Cursor · HTTP</button><button type="button" className={client==='claude-http'?'selected':''} onClick={()=>{setClient('claude-http');setCopied('');}}>Claude · HTTP</button></div><textarea className="agent-config mono" aria-label="Конфигурация MCP" readOnly spellCheck={false} value={config} rows={16}/><div className="agent-config-actions"><button className="btn" type="button" onClick={()=>void copy(config,'config')}>{copied==='config'?<Check size={15}/>:<Copy size={15}/>} {copied==='config'?'Скопировано':'Скопировать конфигурацию'}</button><button className="text-btn" type="button" onClick={()=>{setIssued(null);setCopied('');}}>Я сохранил конфигурацию — скрыть ключ</button></div><p className="helper-note">Stdio bridge обращается к этому серверу Ouro. HTTP-адрес должен быть доступен из среды, где работает ваш агент. Подключение не запускает модель или терминал автоматически.</p></section>}
    <section className="agent-list-section"><div className="section-heading"><h2>Зарегистрированные агенты</h2><span className="quiet-label">{agents.filter(a=>!a.revokedAt).length} ДЕЙСТВУЮЩИХ</span></div>{loading?<p className="helper-note">Читаем регистрации…</p>:agents.length?<div className="agent-list">{agents.map(agent=><article className={`agent-registration ${agent.revokedAt?'revoked':''}`} key={agent.id} data-testid={`agent-${agent.id}`}><div className="agent-registration-icon"><Bot size={20}/></div><div className="agent-registration-body"><div className="agent-registration-heading"><strong>{agent.name}</strong><span className={`status ${agent.revokedAt?'status-invalidated':'status-specified'}`}>{agent.revokedAt?<><Unplug size={13}/>Ключ отозван</>:<><Plug size={13}/>Ключ действует</>}</span></div><code>{agent.id}</code><div className="agent-registration-meta"><span>Создан {date(agent.createdAt)}</span><span>{agent.lastSeenAt?`Обращался ${date(agent.lastSeenAt)}`:'Ещё не обращался'}</span>{agent.revokedAt&&<span>Отозван {date(agent.revokedAt)}</span>}</div></div>{!agent.revokedAt&&<button className="btn btn-small" type="button" disabled={busy} onClick={()=>void revoke(agent)}>Отозвать ключ</button>}</article>)}</div>:<p className="agent-empty">Регистраций пока нет. Создайте ключ и добавьте конфигурацию в MCP-клиент.</p>}</section>
    <section className="agent-instructions"><div className="section-heading"><h2>Первое сообщение агенту</h2><button className="text-btn" onClick={()=>void copy(starter,'prompt')}>{copied==='prompt'?<Check size={14}/>:<Copy size={14}/>}Скопировать инструкцию</button></div><p>{starter}</p><a href="https://github.com/QahNaaRlN/ouro/blob/feat/agent-connect/docs/specs/agent-connect.md" target="_blank" rel="noreferrer">Контракт подключения и критерии приёмки</a></section>
  </>;
}
