'use client';

import {AppSelect} from './app-select';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Box, LogIn, LogOut, Mail, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { Actor } from '@/packages/core/src';
import { selectedProjectId } from '@/lib/client-project';
export { selectedProjectId } from '@/lib/client-project';
import type { ProjectMembership, ProjectMetadata, ProjectRole } from '@/lib/projects';
import './participants-panel.css';

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Операция не выполнена.');
  return body;
}
const post = (url: string, body: unknown, method = 'POST') => request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const selectProject = (projectId: string) => {
  document.cookie = `ouro_project=${encodeURIComponent(projectId)}; SameSite=Strict; Path=/; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`;
  location.reload();
};

export function AccountLogout({ identity }: { identity: Actor | null }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!identity) return null;
  const logout = async () => {
    if (busy) return; setBusy(true); setError('');
    try {
      await post('/api/auth/logout', {});
      document.cookie = 'ouro_project=; SameSite=Strict; Path=/; Max-Age=0';
      location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выйти.'); setBusy(false); }
  };
  return <><button className="icon-btn" type="button" aria-label="Выйти из аккаунта" title="Выйти из аккаунта" disabled={busy} onClick={() => void logout()}><LogOut size={15}/></button>{error&&<span role="alert">{error}</span>}</>;
}

export function EmailLogin() {
  const [mode, setMode] = useState<'login' | 'invitation' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const run = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') await post('/api/auth/login', { email, password });
      else if (mode === 'invitation') await post('/api/auth/invitations/accept', { code, name, password });
      else await post('/api/auth/password-reset/confirm', { code, password });
      setPassword(''); setCode(''); location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Операция не выполнена.'); }
    finally { setBusy(false); }
  };
  const requestReset = async () => {
    if (busy || !email.trim()) return; setBusy(true); setError(''); setNotice('');
    try { await post('/api/auth/password-reset/request', { email }); setNotice('Если аккаунт существует, код отправлен на указанный email.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось запросить код.'); }
    finally { setBusy(false); }
  };
  return <section className="participant-section" aria-label="Вход в аккаунт">
    <div className="section-heading"><h2><LogIn size={17}/>Аккаунт Ouro</h2></div>
    <div className="segmented" aria-label="Операция аккаунта">
      <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
      <button type="button" className={mode === 'invitation' ? 'selected' : ''} onClick={() => { setMode('invitation'); setError(''); }}>Приглашение</button>
      <button type="button" className={mode === 'reset' ? 'selected' : ''} onClick={() => { setMode('reset'); setError(''); }}>Сброс пароля</button>
    </div>
    <form className="participant-login-form" onSubmit={run}>
      {mode !== 'invitation' && <label><span>Email</span><input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></label>}
      {mode === 'invitation' && <label><span>Имя для нового аккаунта</span><input autoComplete="name" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>}
      {mode !== 'login' && <label><span>Одноразовый код из письма</span><input required minLength={43} maxLength={43} value={code} disabled={busy} onChange={event => setCode(event.target.value.trim())}/></label>}
      <label><span>{mode === 'login' ? 'Пароль' : 'Новый пароль'}</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/></label>
      <button className="btn btn-primary" disabled={busy} type="submit">{mode === 'login' ? 'Войти' : mode === 'invitation' ? 'Принять приглашение' : 'Установить пароль'}</button>
    </form>
    {mode === 'invitation' && <p>Для существующего аккаунта сначала войдите, затем примите приглашение на странице участников.</p>}
    {mode === 'reset' && <button className="btn btn-small" type="button" disabled={busy || !email.trim()} onClick={() => void requestReset()}><Mail size={14}/>Отправить код сброса</button>}
    {notice && <p className="participant-notice" role="status">{notice}</p>}{error && <p className="participant-error" role="alert">{error}</p>}
  </section>;
}

export function ProjectSwitcher({ identity }: { identity: Actor | null }) {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]), [current, setCurrent] = useState(selectedProjectId);
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!identity) return;
    let live = true;
    void request('/api/projects').then(body => { if (live) setProjects(body.projects); }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [identity]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!name.trim()) return; setError('');
    try { const body = await post('/api/projects', { name: name.trim() }); selectProject(body.project.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось создать проект.'); }
  };
  if (!identity) return <div className="workspace-switch"><span className="workspace-avatar"><Box size={17}/></span><div><strong>Ouro</strong><small>Требуется вход</small></div></div>;
  return <div className="workspace-switch block">
    <label className="flex w-full flex-col gap-[6px]">
      <span className="quiet-label">ТЕКУЩИЙ ПРОЕКТ</span>
      <AppSelect aria-label="Текущий проект" value={projects.some(project => project.id === current) ? current : ''} onValueChange={selectedValue=> selectProject(selectedValue)} className="w-full rounded-[6px] border border-solid border-ouro-border bg-ouro-bg p-[8px] text-ouro-text">
        {!projects.length && <option value="">Загрузка проектов…</option>}
        {projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.role}</option>)}
      </AppSelect>
    </label>
    {identity.id !== 'local-human' && identity.id !== 'human-token' && <button className="text-btn" type="button" onClick={() => setCreating(value => !value)}><Plus size={13}/>Новый проект</button>}
    {creating && <form onSubmit={create} className="mt-[8px] flex gap-[6px]"><input className="w-full min-w-0" aria-label="Название нового проекта" required maxLength={120} value={name} onChange={event => setName(event.target.value)}/><button className="btn btn-small" type="submit">Создать</button></form>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function ProjectMembersPanel({ projectId, identity }: { projectId: string; identity: Actor }) {
  const [members, setMembers] = useState<ProjectMembership[]>([]), [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [email, setEmail] = useState(''), [role, setRole] = useState<ProjectRole>('Contributor'), [code, setCode] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const currentRole = projects.find(project => project.id === projectId)?.role;
  const reload = useCallback(async () => {
    try {
      const [memberData, projectData] = await Promise.all([request(`/api/projects/${encodeURIComponent(projectId)}/members`), request('/api/projects')]);
      setMembers(memberData.members); setProjects(projectData.projects); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось прочитать участников.'); }
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const invite = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/invitations`, { email, role }); setEmail(''); setNotice('Приглашение создано. Одноразовый код отправлен по email.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось пригласить участника.'); }
    finally { setBusy(false); }
  };
  const changeRole = async (membershipId: string, nextRole: ProjectRole) => {
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(membershipId)}`, { role: nextRole }, 'PATCH'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось изменить роль.'); }
  };
  const revoke = async (membershipId: string) => {
    try { await post(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(membershipId)}`, {}, 'DELETE'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отозвать доступ.'); }
  };
  const accept = async (event: FormEvent) => {
    event.preventDefault(); try { await post('/api/auth/invitations/accept', { code }); setCode(''); location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось принять приглашение.'); }
  };
  return <div className="participants-panel"><div className="page-heading"><div><div className="eyebrow">ДОСТУП К ПРОЕКТУ</div><h1><Users size={25}/>Участники</h1><p className="page-description">Ваша роль: {currentRole ?? 'проверяется'}. Изменения сохраняются с отдельным user ID.</p></div></div>
    {error && <p className="participant-error" role="alert">{error}</p>}{notice && <p className="participant-notice" role="status">{notice}</p>}
    {currentRole === 'Owner' && <section className="participant-section"><div className="section-heading"><h2><UserPlus size={17}/>Пригласить по email</h2></div><form className="participant-create-form" onSubmit={invite}><label><span>Email</span><input type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label><label><span>Роль</span><AppSelect aria-label="Роль" value={role} onValueChange={selectedValue=> setRole(selectedValue as ProjectRole)}><option>Contributor</option><option>Viewer</option><option>Owner</option></AppSelect></label><button className="btn btn-primary" disabled={busy}>Пригласить</button></form></section>}
    <section className="participant-section"><div className="section-heading"><h2>Участники проекта</h2></div><div className="participant-directory">{members.map(member => <article className="participant-card" key={member.id}><div><strong>{member.name}</strong><small>{member.email}</small><code className="participant-id">{member.userId}</code>{member.revokedAt && <small>Доступ отозван</small>}</div><div>{currentRole === 'Owner' && !member.revokedAt ? <><AppSelect aria-label={`Роль ${member.name}`} value={member.role} onValueChange={selectedValue=> void changeRole(member.id, selectedValue as ProjectRole)}><option>Owner</option><option>Contributor</option><option>Viewer</option></AppSelect><button className="btn btn-small" onClick={() => void revoke(member.id)}>Отозвать доступ</button></> : <span className="participant-badge">{member.role}</span>}</div></article>)}</div></section>
    <section className="participant-section"><div className="section-heading"><h2><ShieldCheck size={17}/>Приглашение для {identity.name ?? 'текущего аккаунта'}</h2></div><form className="participant-login-form" onSubmit={accept}><label><span>Одноразовый код</span><input required minLength={43} maxLength={43} value={code} onChange={event => setCode(event.target.value.trim())}/></label><button className="btn">Принять приглашение</button></form></section>
  </div>;
}
