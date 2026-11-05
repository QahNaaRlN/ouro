import 'i18next';
import type { ouroRussianResources } from './resources.const';

/** App-owned типизация текущего RU registry, общая для двух существующих оболочек Ouro. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'assignWork';
    resources: typeof ouroRussianResources.ru;
    strictKeyChecks: true;
    enableSelector: false;
    returnNull: false;
  }
}
