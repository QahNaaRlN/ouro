'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Порт расположения проектного представления, не раскрывающий конкретный router. */
export type ProjectLocationPort = Readonly<{
  readSearch(): string;
  pushSearch(search: string): void;
  subscribe(onChange: () => void): () => void;
}>;

const browserLocation: ProjectLocationPort = {
  readSearch: () => window.location.search,
  pushSearch(search) {
    window.history.pushState(null, '', window.location.pathname + (search ? '?' + search : ''));
  },
  subscribe(onChange) {
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  },
};
const LocationContext = createContext<ProjectLocationPort>(browserLocation);

/** Предоставляет навигационную зависимость оболочки общим проектным экранам. */
export function ProjectLocationProvider({
  value,
  children,
}: {
  value: ProjectLocationPort;
  children: ReactNode;
}) {
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** Возвращает объявленный оболочкой способ чтения и изменения проектного URL. */
export function useProjectLocation(): ProjectLocationPort {
  return useContext(LocationContext);
}
