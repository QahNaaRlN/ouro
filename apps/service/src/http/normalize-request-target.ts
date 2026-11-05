import { stringify } from 'node:querystring';

const parseOrigin = 'http://ouro.invalid';

/** Возвращает прежний относительный redirect, сохраняя порядок двух механизмов Next и форму query. */
export function normalizeRequestTarget(target: string): string | undefined {
  if (!target.startsWith('/')) return undefined;
  const parts = target.split('?'),
    pathname = parts[0];
  if (/\\|\/\//.test(pathname)) {
    const normalized =
      pathname.replaceAll('\\', '/').replace(/\/{2,}/g, '/') +
      (parts[1] ? '?' + parts.slice(1).join('?') : '');
    const parsed = new URL(parseOrigin + normalized);
    return parsed.pathname + parsed.search + parsed.hash;
  }
  const parsed = new URL(parseOrigin + target);
  if (parsed.pathname === '/' || !parsed.pathname.endsWith('/')) return undefined;
  const query = Object.create(null) as Record<string, string | string[]>;
  for (const [key, value] of parsed.searchParams) {
    const previous = query[key];
    if (previous === undefined) query[key] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else query[key] = [previous, value];
  }
  const search = stringify(query);
  return parsed.pathname.slice(0, -1) + (search ? '?' + search : '') + parsed.hash;
}
