import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const anchor = new URL(import.meta.url).searchParams.get('package');
if (!anchor || new URL(anchor).protocol !== 'file:')
  throw new Error('Owned Playwright package anchor is required.');
const ownerRequire = createRequire(anchor);
const allowed = new Set(['@playwright/test', '@playwright/test/package.json']);
const commonJs = new Map(
  [...allowed].map((specifier) => [specifier, pathToFileURL(ownerRequire.resolve(specifier)).href]),
);

/** Разрешает точный Playwright allowlist от server package, сохраняя штатные import/require conditions. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!allowed.has(specifier)) return nextResolve(specifier, context);
    const resolved = commonJs.get(specifier);
    if (context.conditions.includes('require') && resolved)
      return { url: resolved, shortCircuit: true };
    return nextResolve(specifier, { ...context, parentURL: anchor });
  },
});
