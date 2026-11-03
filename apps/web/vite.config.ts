import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

/** Ограничивает SPA fallback UI-маршрутами, сохраняя ошибки API и отсутствующих assets. */
function routeFallbackBoundary(target: string | undefined): Plugin {
  const middleware = (preview: boolean): Connect.NextHandleFunction => (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://ouro.invalid').pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (target) { next(); return; }
      response.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: { code: 'API_NOT_CONFIGURED', message: 'API origin is not configured for this web preview.' } }));
      return;
    }
    const uiRoute = pathname === '/' || /^\/projects(?:\/[^/]+(?:\/members)?)?\/?$/.test(pathname);
    const devModule = !preview && ['/src/', '/@', '/node_modules/'].some(prefix => pathname.startsWith(prefix));
    if (!uiRoute && !devModule) {
      let decoded: string;
      try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end(); return; }
      const bases = preview ? [local('./dist')] : [local('../../public'), local('.')];
      const asset = bases.some(base => {
        const filename = path.resolve(base, '.' + decoded), relative = path.relative(base, filename);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
        try { return statSync(filename).isFile(); } catch { return false; }
      });
      if (!asset) { response.writeHead(404); response.end(); return; }
    }
    next();
  };
  return {
    name: 'ouro-route-fallback-boundary',
    configureServer(server) { server.middlewares.use(middleware(false)); },
    configurePreviewServer(server) { server.middlewares.use(middleware(true)); },
  };
}

/** Не допускает серверные зависимости в исполняемую браузерную сборку. */
function browserBoundary(): Plugin {
  return {
    name: 'ouro-browser-boundary',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith('node:') || builtins.has(source) || /^(?:pg|nodemailer|@electric-sql\/pglite|@node-rs\/argon2|@modelcontextprotocol\/sdk)(?:\/|$)/.test(source)) {
        throw new Error(`Server dependency in browser bundle: ${source}`);
      }
      return null;
    },
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (/\/(?:apps\/service|node_modules\/next)\//.test(id.replaceAll('\\', '/'))) throw new Error(`Server module in browser bundle: ${id}`);
      }
    },
  };
}

/** Собирает standalone shell с явным same-origin API proxy только на стороне dev server. */
export default defineConfig(() => {
  const target = process.env.OURO_WEB_API_ORIGIN;
  if (target) {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('OURO_WEB_API_ORIGIN must be a credential-free HTTP origin.');
  }
  const proxy = target ? { '/api': { target, changeOrigin: false } } : undefined;
  return {
    root: local('.'),
    publicDir: local('../../public'),
    plugins: [browserBoundary(), routeFallbackBoundary(target), react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        { find: 'next/link', replacement: local('./src/app/legacy-navigation-link.tsx') },
        { find: 'next/navigation', replacement: local('./src/app/legacy-navigation.ts') },
        { find: '@', replacement: repositoryRoot },
      ],
    },
    css: { postcss: repositoryRoot },
    server: { host: '127.0.0.1', proxy, fs: { allow: [repositoryRoot] } },
    preview: { host: '127.0.0.1', proxy },
    build: { target: ['chrome111', 'edge111', 'firefox128', 'safari16.4'], outDir: 'dist', emptyOutDir: true },
  };
});
