import type { AppError, ClientErrorKind } from '@/packages/client/src/ports';
import type { assignWorkRu } from '../locales/ru';

/** Конечные ключи безопасного сообщения формы; raw error text сюда не передаётся. */
export type AssignWorkErrorKey = `errors.${keyof typeof assignWorkRu.errors}`;
const kindKeys = {
  access: 'errors.access',
  contract: 'errors.contract',
  network: 'errors.network',
  cancelled: 'errors.cancelled',
  rejected: 'errors.rejected',
  unexpected: 'errors.unexpected',
} as const satisfies Record<ClientErrorKind, AssignWorkErrorKey>;

/** Переводит только известные коды и безопасную категорию через переданную функцию, не читая message/stack. */
export function translateAssignWorkError(
  error: AppError,
  translate: (key: AssignWorkErrorKey) => string,
): string {
  switch (error.code) {
    case 'CANCELLED':
      return translate('errors.cancelled');
    case 'NETWORK_ERROR':
      return translate('errors.network');
    case 'UNEXPECTED_ERROR':
      return translate('errors.unexpected');
    case 'CLIENT_ERROR':
      return translate('errors.unconfirmed');
    default:
      return translate(kindKeys[error.kind]);
  }
}
