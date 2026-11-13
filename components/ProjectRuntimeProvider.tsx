'use client';

import { createContext, useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { createOuroI18n } from '@/packages/frontend/src/app/i18n';
import type { createProjectRuntime } from '@/packages/frontend/src/app/project-runtime';
import { createWebProjectRuntime, WEB_PROJECT_SOURCE_ID } from './create-web-project-runtime';
import { hasPendingWorkspaceIntents } from '@/packages/client/src/http/workspace-intents';
import { createCatalogHttpReads } from '@/packages/client/src/http/create-catalog-http-reads';
import {
  CatalogReadEnvironmentProvider,
  type CatalogReadEnvironment,
} from '@/packages/frontend/src/shared/catalog-read-environment';
import type { ErrorReporterPort } from '@/packages/client/src/ports';
import { AppErrorBoundary } from '@/packages/frontend/src/shared/ui/error-boundary';

/** Контекст, который передаёт уже собранный runtime ближайшему владельцу проекта. */
export const ProjectRuntimeContext = createContext<ReturnType<typeof createProjectRuntime> | null>(
  null,
);
/** Компонент, который предоставляет общий web cache и registry обоим существующим интерфейсам. */
export function ProjectRuntimeProvider({ children }: { children: ReactNode }) {
  const [i18n] = useState(createOuroI18n);
  const [reporter] = useState<ErrorReporterPort>(() => ({
    report: (occurrence) => {
      console.error('[ouro/client]', occurrence);
    },
  }));
  const [runtime] = useState(() => createWebProjectRuntime(reporter));
  const [readEnvironment] = useState<CatalogReadEnvironment>(() => ({
    sourceId: WEB_PROJECT_SOURCE_ID,
    reads: createCatalogHttpReads(),
    reporter,
  }));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasPendingWorkspaceIntents()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <ProjectRuntimeContext.Provider value={runtime}>
        <QueryClientProvider client={runtime.queryClient}>
          <CatalogReadEnvironmentProvider value={readEnvironment}>
            <AppErrorBoundary reporter={reporter}>{children}</AppErrorBoundary>
          </CatalogReadEnvironmentProvider>
        </QueryClientProvider>
      </ProjectRuntimeContext.Provider>
    </I18nextProvider>
  );
}
