import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'yjs', 'lib0'],
  poweredByHeader: false,
};
export default config;
