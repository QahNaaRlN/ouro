/** Публичная граница HTTP adapter отдельного Node-сервиса Ouro. */
export { createServiceApp } from './http/create-service-app.js';
export { startHttpServer } from './bootstrap/start-http-server.js';
export {createBackendRoutes} from './backend/create-backend.js';
export {runtimeConfiguration} from './runtime/configuration.js';
export {startService} from './runtime/start-service.js';
export {StartupCleanupIncompleteError} from './runtime/cleanup-startup.js';
export type {StartupCleanupStatus} from './runtime/cleanup-startup.js';
export type {BackendOptions} from './backend/create-backend.js';
export type {RuntimeConfiguration} from './runtime/configuration.js';
export type { ServiceApplication, ServiceBackgroundTask, ServiceDiagnostic, ServiceHandler, ServiceMethod, ServiceNodeBindings, ServiceOptions, ServiceReporter, ServiceRequestContext, ServiceResponseLifecycle, ServiceRoute } from './http/service-types.js';
