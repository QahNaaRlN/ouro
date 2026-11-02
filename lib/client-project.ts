import { PROJECT_ID } from '../packages/core/src';

let pinnedProjectId: string | undefined;

/** Browser-page context only. A different tab may update the preference cookie. */
export function selectedProjectId(): string {
  if (typeof document === 'undefined') return PROJECT_ID;
  if (pinnedProjectId !== undefined) return pinnedProjectId;
  const value = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith('ouro_project='))?.slice('ouro_project='.length);
  try {
    const id = value ? decodeURIComponent(value) : PROJECT_ID;
    pinnedProjectId = /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : PROJECT_ID;
  } catch { pinnedProjectId = PROJECT_ID; }
  return pinnedProjectId;
}

const projectResource = /^\/api\/(?:project|commands|events|stream|agents|github|meridian|drafts|simulator|participants)(?:\/|$)/;
function projectUrl(input: string | URL): URL | null {
  const origin = typeof location === 'undefined' ? 'http://ouro.invalid' : location.origin;
  const url = new URL(String(input), origin);
  return url.origin === origin && projectResource.test(url.pathname) ? url : null;
}

/** EventSource cannot send custom headers. Preserve explicit scope and cursors. */
export function projectRequestUrl(input: string | URL, projectId = selectedProjectId()): string {
  const original = String(input), url = projectUrl(input);
  if (!url || url.searchParams.has('projectId')) return original;
  url.searchParams.set('projectId', projectId);
  return /^[a-z][a-z0-9+.-]*:/i.test(original) ? url.href : url.pathname + url.search + url.hash;
}

/** Bind legacy project endpoints without changing native request/retry semantics. */
export function projectFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const url = projectUrl(request ? request.url : String(input));
  if (!url || url.searchParams.has('projectId')) return globalThis.fetch(input, init);
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('X-Ouro-Project-Id')) headers.set('X-Ouro-Project-Id', selectedProjectId());
  return globalThis.fetch(input, { ...init, headers });
}
