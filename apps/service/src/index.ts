/** Публичная граница HTTP adapter отдельного Node-сервиса Ouro. */
export { createServiceApp } from './http/create-service-app.js';
export { startHttpServer } from './bootstrap/start-http-server.js';
export type { ServiceApplication, ServiceBackgroundTask, ServiceDiagnostic, ServiceHandler, ServiceMethod, ServiceNodeBindings, ServiceOptions, ServiceReporter, ServiceRequestContext, ServiceResponseLifecycle, ServiceRoute } from './http/service-types.js';
