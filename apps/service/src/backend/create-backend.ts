import type { ServiceRoute } from '../http/service-types.js';
import type { Store } from '../../../../lib/store';
import { backendRoutes } from './routes.js';

/** Зависимости полного backend, передаваемые владельцем runtime. */
export type BackendOptions = {
  store: Store;
  environment: Record<string, string | undefined>;
  resourceRoot: string;
  mcpPath?: string;
  mcpArgs?: readonly string[];
  storage?: 'postgres' | 'embedded-postgres';
  kickWorker?: (signal?: AbortSignal) => Promise<void>;
  ready?: () => boolean;
};

/** Собирает HTTP-контракты backend из единственного переданного owner. */
export function createBackendRoutes(options: BackendOptions): ServiceRoute[] {
  return backendRoutes(options);
}
