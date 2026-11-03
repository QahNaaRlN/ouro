import { useRouter as useTanStackRouter } from '@tanstack/react-router';
import { useMemo } from 'react';

/** Адаптирует только используемую legacy-операцию push к навигации web shell. */
export function useRouter() {
  const router = useTanStackRouter();
  return useMemo(() => ({
    push(href: string) {
      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin || !['http:', 'https:'].includes(destination.protocol)) throw new Error('Project navigation requires a same-origin HTTP URL.');
      void router.navigate({ href: destination.pathname + destination.search + destination.hash });
    },
  }), [router]);
}
