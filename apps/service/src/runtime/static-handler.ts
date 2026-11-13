import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const media: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Обслуживает только явно заданный build root; API и отсутствующие assets не получают SPA index. */
export async function createStaticHandler(directory: string) {
  const root = await realpath(directory),
    index = path.join(root, 'index.html');
  if (!(await stat(index)).isFile()) throw new Error('SPA index must be a file.');
  return async (request: Request): Promise<Response> => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      /[\\\u0000-\u001f]/.test(pathname) ||
      pathname.split('/').some((segment) => segment.startsWith('.'))
    )
      return new Response(null, { status: 404 });
    let target = path.join(root, pathname);
    const bounded = (value: string) => value === root || value.startsWith(root + path.sep);
    if (!bounded(target)) return new Response(null, { status: 404 });
    try {
      target = await realpath(target);
      if (!bounded(target)) return new Response(null, { status: 404 });
      if (!(await stat(target)).isFile()) throw new Error('Not an asset');
    } catch {
      const ui =
        pathname === '/' ||
        pathname === '/projects' ||
        pathname === '/projects/help' ||
        /^\/projects\/[A-Za-z0-9_-]+(?:\/members)?$/.test(pathname);
      if (
        !ui ||
        path.extname(pathname) ||
        pathname.startsWith('/assets/') ||
        !request.headers.get('accept')?.includes('text/html')
      )
        return new Response(null, { status: 404 });
      target = index;
    }
    const bytes = await readFile(target),
      isIndex = target === index;
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: {
        'Content-Type': media[path.extname(target)] ?? 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
