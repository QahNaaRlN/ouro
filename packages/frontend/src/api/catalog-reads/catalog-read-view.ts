import type { UseQueryResult } from '@tanstack/react-query';
import type { ClientError, CatalogReadResult } from '../../../../client/src/ports';

/** Выводит finite read state; disabled и unsupported не являются вечной загрузкой. */
export function catalogReadView<T>(
  query: Pick<
    UseQueryResult<CatalogReadResult<T>, ClientError>,
    'data' | 'error' | 'isFetching' | 'isPending'
  >,
  enabled: boolean,
  available = true,
) {
  if (!enabled) return { status: 'idle' as const, data: undefined, error: null, refreshing: false };
  if (!available || query.data?.status === 'unsupported')
    return { status: 'unavailable' as const, data: undefined, error: null, refreshing: false };
  if (query.data?.status === 'available')
    return {
      status: 'ready' as const,
      data: query.data.value,
      error: query.error,
      refreshing: query.isFetching,
    };
  if (query.error)
    return { status: 'error' as const, data: undefined, error: query.error, refreshing: false };
  return {
    status: query.isFetching ? ('loading' as const) : ('idle' as const),
    data: undefined,
    error: null,
    refreshing: false,
  };
}
